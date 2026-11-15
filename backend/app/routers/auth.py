"""UC-01, UC-02: регистрация, вход, обновление токенов, выход, восстановление пароля."""

from __future__ import annotations

from datetime import timedelta

import jwt
from fastapi import APIRouter, status
from sqlalchemy import select

from ..config import get_settings
from ..database import utcnow
from ..deps import DB
from ..errors import ApiError
from ..models import PasswordResetToken, RefreshToken, User, new_jti
from ..schemas import (
    LoginIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    RefreshIn,
    RegisterIn,
    TokenPair,
)
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_reset_token,
    new_reset_token,
    verify_password,
)
from ..services.mailer import send_email

router = APIRouter(prefix="/auth", tags=["auth"])


def issue_tokens(db: DB, user: User) -> TokenPair:
    jti = new_jti()
    refresh, lifetime = create_refresh_token(user.id, jti)
    db.add(RefreshToken(id=jti, user_id=user.id, expires_at=utcnow() + lifetime))
    db.commit()
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=refresh,
        expires_in=get_settings().access_token_minutes * 60,
    )


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, db: DB) -> TokenPair:
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise ApiError(409, "email_taken", "E-mail уже зарегистрирован")
    user = User(
        email=email,
        password_hash=hash_password(data.password),
        name=data.name.strip(),
        timezone=get_settings().default_timezone,
    )
    db.add(user)
    db.commit()
    return issue_tokens(db, user)


@router.post("/login", response_model=TokenPair)
def login(data: LoginIn, db: DB) -> TokenPair:
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if user is None or not verify_password(data.password, user.password_hash):
        # Не уточняем, что именно неверно (US-02)
        raise ApiError(401, "invalid_credentials", "Неверный e-mail или пароль")
    return issue_tokens(db, user)


def _load_refresh(db: DB, token: str) -> RefreshToken:
    try:
        payload = decode_token(token, "refresh")
    except jwt.PyJWTError as exc:
        raise ApiError(401, "invalid_refresh", "Сессия истекла, войдите заново") from exc
    record = db.get(RefreshToken, payload.get("jti", ""))
    if record is None or record.revoked_at is not None or record.expires_at < utcnow():
        raise ApiError(401, "invalid_refresh", "Сессия истекла, войдите заново")
    return record


@router.post("/refresh", response_model=TokenPair)
def refresh(data: RefreshIn, db: DB) -> TokenPair:
    """Ротация: старый refresh-токен отзывается, выдаётся новая пара."""
    record = _load_refresh(db, data.refresh_token)
    record.revoked_at = utcnow()
    user = db.get(User, record.user_id)
    return issue_tokens(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(data: RefreshIn, db: DB) -> None:
    try:
        record = _load_refresh(db, data.refresh_token)
    except ApiError:
        return  # уже недействителен — выход всё равно успешен
    record.revoked_at = utcnow()
    db.commit()


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def password_reset_request(data: PasswordResetRequestIn, db: DB) -> dict:
    """ФТ-05. Ответ одинаковый для существующего и несуществующего e-mail."""
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if user is not None:
        token, token_hash = new_reset_token()
        db.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=utcnow() + timedelta(hours=1)))
        db.commit()
        link = f"{get_settings().frontend_url}/reset-password?token={token}"
        send_email(
            user.email,
            "StudyTrack: восстановление пароля",
            f"Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):\n{link}\n\n"
            "Если вы не запрашивали восстановление, просто проигнорируйте письмо.",
        )
    return {"message": "Если такой e-mail зарегистрирован, мы отправили на него ссылку"}


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def password_reset_confirm(data: PasswordResetConfirmIn, db: DB) -> None:
    record = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_reset_token(data.token)))
    if record is None or record.used_at is not None or record.expires_at < utcnow():
        raise ApiError(400, "invalid_reset_token", "Ссылка недействительна или устарела")
    user = db.get(User, record.user_id)
    user.password_hash = hash_password(data.new_password)
    record.used_at = utcnow()
    # После смены пароля завершаем все сессии
    for token in db.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    ):
        token.revoked_at = utcnow()
    db.commit()
