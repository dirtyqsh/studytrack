"""Точка входа FastAPI-приложения StudyTrack."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .errors import install_error_handlers
from .routers import auth, dashboard, notifications, semesters, tags, tasks, users
from .schemas import ErrorOut
from .services.reminders import start_scheduler

ERROR_TEXT = {
    400: "Неверные данные (например, текущий пароль)",
    401: "Нет или истёк токен доступа",
    404: "Объект не найден или принадлежит другому пользователю",
    409: "Конфликт с бизнес-правилом (архивный семестр, оценка не в «Сдано» и др.)",
}

API_PREFIX = "/api/v1"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    scheduler = start_scheduler()
    yield
    if scheduler is not None:
        scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description=(
            "REST API персонального трекера учебных задач StudyTrack. "
            "Все методы, кроме /auth/*, требуют заголовок Authorization: Bearer <access_token>."
        ),
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

    # Ошибки описываются в спецификации OpenAPI единой схемой ErrorOut (Т-07)
    def errors(*codes: int) -> dict:
        return {code: {"model": ErrorOut, "description": ERROR_TEXT[code]} for code in codes}

    api = APIRouter(prefix=API_PREFIX)
    api.include_router(auth.router, responses=errors(400, 401, 409))
    api.include_router(users.router, responses=errors(400, 401))
    for module in (semesters, tasks, tags, notifications):
        api.include_router(module.router, responses=errors(401, 404, 409))
    api.include_router(dashboard.router, responses=errors(401))
    app.include_router(api)

    @app.get("/api/health", tags=["service"])
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
