"""Настройки приложения. Все значения читаются из переменных окружения."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = "StudyTrack API"
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./studytrack.db"))
    secret_key: str = field(default_factory=lambda: os.getenv("SECRET_KEY", "change-me-in-production"))
    access_token_minutes: int = field(default_factory=lambda: int(os.getenv("ACCESS_TOKEN_MINUTES", "15")))
    refresh_token_days: int = field(default_factory=lambda: int(os.getenv("REFRESH_TOKEN_DAYS", "7")))
    cors_origins: list[str] = field(default_factory=lambda: _list("CORS_ORIGINS", "http://localhost:5173"))
    frontend_url: str = field(default_factory=lambda: os.getenv("FRONTEND_URL", "http://localhost:5173"))
    # Параметры Argon2id (Т-02). В тестах память уменьшается, чтобы они шли быстро.
    argon2_memory_kib: int = field(default_factory=lambda: int(os.getenv("ARGON2_MEMORY_KIB", str(64 * 1024))))
    argon2_iterations: int = field(default_factory=lambda: int(os.getenv("ARGON2_ITERATIONS", "3")))
    # Планировщик напоминаний (ФТ-27, ФТ-28)
    scheduler_enabled: bool = field(default_factory=lambda: _bool("SCHEDULER_ENABLED", True))
    reminder_interval_minutes: int = field(default_factory=lambda: int(os.getenv("REMINDER_INTERVAL_MINUTES", "15")))
    # SMTP. Если SMTP_HOST пуст, письма не отправляются, а пишутся в лог.
    smtp_host: str = field(default_factory=lambda: os.getenv("SMTP_HOST", ""))
    smtp_port: int = field(default_factory=lambda: int(os.getenv("SMTP_PORT", "587")))
    smtp_user: str = field(default_factory=lambda: os.getenv("SMTP_USER", ""))
    smtp_password: str = field(default_factory=lambda: os.getenv("SMTP_PASSWORD", ""))
    smtp_from: str = field(default_factory=lambda: os.getenv("SMTP_FROM", "StudyTrack <noreply@studytrack.local>"))
    smtp_starttls: bool = field(default_factory=lambda: _bool("SMTP_STARTTLS", True))
    default_timezone: str = field(default_factory=lambda: os.getenv("DEFAULT_TIMEZONE", "Europe/Moscow"))


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings() -> None:
    """Сбрасывает кэш настроек (используется в тестах)."""
    global _settings
    _settings = None
