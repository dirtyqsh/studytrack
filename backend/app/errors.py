"""Единый формат ошибок API: {"code": "...", "message": "..."}."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message


# Род сущности для согласования «не найден / не найдена / не найдено»
_FEMININE = {"Дисциплина", "Задача", "Подзадача", "Метка"}
_NEUTER = {"Уведомление"}


def not_found(entity: str = "Объект") -> ApiError:
    ending = "а" if entity in _FEMININE else "о" if entity in _NEUTER else ""
    return ApiError(404, "not_found", f"{entity} не найден{ending}")


def _ru_message(err: dict) -> str:
    """Сообщения валидации Pydantic на русском (Т-08)."""
    ctx = err.get("ctx") or {}
    kind = err.get("type", "")
    messages = {
        "missing": "обязательное поле",
        "string_too_short": f"не короче {ctx.get('min_length')} символов",
        "string_too_long": f"не длиннее {ctx.get('max_length')} символов",
        "greater_than_equal": f"значение должно быть не меньше {ctx.get('ge')}",
        "less_than_equal": f"значение должно быть не больше {ctx.get('le')}",
        "greater_than": f"значение должно быть больше {ctx.get('gt')}",
        "too_long": f"не больше {ctx.get('max_length')} элементов",
        "string_pattern_mismatch": "неверный формат",
        "enum": f"допустимые значения: {ctx.get('expected', '')}",
        "literal_error": f"допустимые значения: {ctx.get('expected', '')}",
        "int_parsing": "ожидается целое число",
        "int_type": "ожидается целое число",
        "float_parsing": "ожидается число",
        "decimal_parsing": "ожидается число",
        "bool_parsing": "ожидается true или false",
        "date_from_datetime_parsing": "ожидается дата ГГГГ-ММ-ДД",
        "date_parsing": "ожидается дата ГГГГ-ММ-ДД",
        "datetime_from_date_parsing": "ожидается дата и время ISO 8601",
        "datetime_parsing": "ожидается дата и время ISO 8601",
        "json_invalid": "некорректный JSON",
        "model_attributes_type": "ожидается объект",
        "list_type": "ожидается список",
        "string_type": "ожидается строка",
    }
    if kind in messages:
        return messages[kind]
    if kind == "value_error":
        text = str(ctx.get("error", err.get("msg", "")))
        if "email" in text.lower():
            return "некорректный адрес e-mail"
        return text.removeprefix("Value error, ")
    return err.get("msg", "некорректное значение")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": code.get(exc.status_code, "http_error"), "message": str(exc.detail)},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(p) for p in err.get("loc", ()) if p != "body"),
                "message": _ru_message(err),
            }
            for err in exc.errors()
        ]
        first = details[0] if details else {"field": "", "message": "Некорректные данные"}
        return JSONResponse(
            status_code=422,
            content={
                "code": "validation_error",
                "message": f"Некорректное значение поля «{first['field']}»: {first['message']}",
                "details": details,
            },
        )
