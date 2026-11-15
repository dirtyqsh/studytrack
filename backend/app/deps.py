"""Зависимости FastAPI: текущий пользователь и проверка владельца данных (Т-03)."""

from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .errors import ApiError, not_found
from .models import Course, Semester, Subtask, Tag, Task, User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DB,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    if creds is None:
        raise ApiError(401, "unauthorized", "Требуется авторизация")
    try:
        payload = decode_token(creds.credentials, "access")
    except jwt.ExpiredSignatureError as exc:
        raise ApiError(401, "token_expired", "Срок действия токена истёк") from exc
    except jwt.PyJWTError as exc:
        raise ApiError(401, "unauthorized", "Недействительный токен") from exc
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise ApiError(401, "unauthorized", "Пользователь не найден")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# --- Загрузка объектов только своего пользователя (чужие = 404, чтобы не раскрывать их существование)


def own_semester(db: Session, user: User, semester_id: int) -> Semester:
    semester = db.get(Semester, semester_id)
    if semester is None or semester.user_id != user.id:
        raise not_found("Семестр")
    return semester


def own_course(db: Session, user: User, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if course is None or course.semester.user_id != user.id:
        raise not_found("Дисциплина")
    return course


def own_task(db: Session, user: User, task_id: int) -> Task:
    task = db.get(Task, task_id)
    if task is None or task.course.semester.user_id != user.id:
        raise not_found("Задача")
    return task


def own_subtask(db: Session, user: User, subtask_id: int) -> Subtask:
    subtask = db.get(Subtask, subtask_id)
    if subtask is None or subtask.task.course.semester.user_id != user.id:
        raise not_found("Подзадача")
    return subtask


def own_tag(db: Session, user: User, tag_id: int) -> Tag:
    tag = db.get(Tag, tag_id)
    if tag is None or tag.user_id != user.id:
        raise not_found("Метка")
    return tag


def ensure_writable(semester: Semester) -> None:
    """БП-01: архивный семестр доступен только для чтения."""
    if semester.is_archived:
        raise ApiError(409, "semester_archived", "Семестр в архиве и доступен только для чтения")
