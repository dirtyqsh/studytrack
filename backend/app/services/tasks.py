"""Бизнес-логика задач: статусы, порядок на доске, сериализация."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, contains_eager, selectinload

from ..database import utcnow
from ..errors import ApiError
from ..models import Course, Task, TaskStatus
from ..schemas import TaskDetail, TaskOut


def with_relations(stmt):
    """Подгружает дисциплину, метки и чек-лист вместе со списком задач (без N+1 запросов).

    Запрос уже содержит JOIN с Course, поэтому дисциплина берётся из него же.
    """
    return stmt.options(contains_eager(Task.course), selectinload(Task.tags), selectinload(Task.subtasks))


def to_out(task: Task) -> TaskOut:
    out = TaskOut.model_validate(task)
    out.subtasks_total = len(task.subtasks)
    out.subtasks_done = sum(1 for s in task.subtasks if s.is_done)
    return out


def to_detail(task: Task) -> TaskDetail:
    detail = TaskDetail.model_validate(task)
    detail.subtasks_total = len(task.subtasks)
    detail.subtasks_done = sum(1 for s in task.subtasks if s.is_done)
    return detail


def column_tasks(db: Session, semester_id: int, status: TaskStatus, exclude_id: int | None = None) -> list[Task]:
    """Задачи одной колонки доски (семестр + статус) в порядке position."""
    stmt = (
        select(Task)
        .join(Course)
        .where(Course.semester_id == semester_id, Task.status == status)
        .order_by(Task.position, Task.id)
    )
    tasks = list(db.scalars(stmt))
    return [t for t in tasks if t.id != exclude_id]


def next_position(db: Session, semester_id: int, status: TaskStatus) -> int:
    tasks = column_tasks(db, semester_id, status)
    return (max((t.position for t in tasks), default=-1)) + 1


def apply_status(task: Task, new_status: TaskStatus) -> None:
    """БП-04: «Сдано» фиксирует дату завершения; возврат из «Сдано» очищает её и оценку."""
    if new_status == task.status:
        return
    if new_status == TaskStatus.done:
        task.completed_at = utcnow()
    elif task.status == TaskStatus.done:
        task.completed_at = None
        task.grade = None
    task.status = new_status


def set_grade(task: Task, grade: float | None) -> None:
    """БП-02: оценку можно внести только для задачи в статусе «Сдано»."""
    if grade is not None and task.status != TaskStatus.done:
        raise ApiError(409, "grade_not_allowed", "Оценку можно внести только для сданной задачи")
    task.grade = grade


def move(db: Session, task: Task, status: TaskStatus, position: int) -> None:
    """Перемещает карточку в колонку status на позицию position и перенумеровывает колонки."""
    semester_id = task.course.semester_id
    old_status = task.status
    apply_status(task, status)
    target = column_tasks(db, semester_id, status, exclude_id=task.id)
    position = min(position, len(target))
    target.insert(position, task)
    for index, item in enumerate(target):
        item.position = index
    if old_status != status:
        for index, item in enumerate(column_tasks(db, semester_id, old_status, exclude_id=task.id)):
            item.position = index
