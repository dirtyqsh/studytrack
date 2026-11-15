"""Хэширование паролей (Argon2id) и JWT-токены."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import timedelta

import jwt
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id

from .config import get_settings
from .database import utcnow

ALGORITHM = "HS256"
_LANES = 4
_HASH_LEN = 32


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode().rstrip("=")


def _unb64(data: str) -> bytes:
    return base64.b64decode(data + "=" * (-len(data) % 4))


def _derive(password: str, salt: bytes, memory: int, iterations: int, lanes: int, length: int) -> bytes:
    kdf = Argon2id(
        salt=salt,
        length=length,
        iterations=iterations,
        lanes=lanes,
        memory_cost=memory,
    )
    return kdf.derive(password.encode("utf-8"))


def hash_password(password: str) -> str:
    """Возвращает хэш в стандартном PHC-формате: $argon2id$v=19$m=..,t=..,p=..$salt$hash."""
    settings = get_settings()
    salt = os.urandom(16)
    digest = _derive(password, salt, settings.argon2_memory_kib, settings.argon2_iterations, _LANES, _HASH_LEN)
    params = f"m={settings.argon2_memory_kib},t={settings.argon2_iterations},p={_LANES}"
    return f"$argon2id$v=19${params}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        _, algo, _version, params, salt_b64, hash_b64 = encoded.split("$")
        if algo != "argon2id":
            return False
        values = dict(item.split("=") for item in params.split(","))
        expected = _unb64(hash_b64)
        actual = _derive(
            password,
            _unb64(salt_b64),
            int(values["m"]),
            int(values["t"]),
            int(values["p"]),
            len(expected),
        )
    except (ValueError, KeyError):
        return False
    return hmac.compare_digest(actual, expected)


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    now = utcnow()
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(user_id: int, jti: str) -> tuple[str, timedelta]:
    settings = get_settings()
    now = utcnow()
    lifetime = timedelta(days=settings.refresh_token_days)
    payload = {"sub": str(user_id), "type": "refresh", "jti": jti, "iat": now, "exp": now + lifetime}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM), lifetime


def decode_token(token: str, expected_type: str) -> dict:
    """Проверяет подпись, срок и тип токена. Бросает jwt.PyJWTError при ошибке."""
    payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def new_reset_token() -> tuple[str, str]:
    """Возвращает (токен для письма, его SHA-256 для хранения в БД)."""
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).hexdigest()


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
