"""UC-13: профиль пользователя и настройки напоминаний (ФТ-04)."""

from __future__ import annotations

from fastapi import APIRouter, status

from ..deps import DB, CurrentUser
from ..errors import ApiError
from ..schemas import PasswordChangeIn, UserOut, UserUpdate
from ..security import hash_password, verify_password

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdate, user: CurrentUser, db: DB) -> UserOut:
    values = data.model_dump(exclude_unset=True)
    if "remind_days" in values:
        user.remind_days = ",".join(str(d) for d in sorted(set(values.pop("remind_days") or [])))
    for key, value in values.items():
        if value is not None:
            setattr(user, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    return UserOut.model_validate(user)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: PasswordChangeIn, user: CurrentUser, db: DB) -> None:
    if not verify_password(data.current_password, user.password_hash):
        raise ApiError(400, "wrong_password", "Текущий пароль указан неверно")
    user.password_hash = hash_password(data.new_password)
    db.commit()
