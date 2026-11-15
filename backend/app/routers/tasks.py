"""UC-05…UC-10: задачи, доска, чек-листы, поиск и фильтры (ФТ-09…ФТ-22)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select

from ..database import utcnow
from ..deps import DB, CurrentUser, ensure_writable, own_course, own_semester, own_subtask, own_tag, own_task
from ..errors import ApiError
from ..models import (
    ACTIVE_STATUSES,
    Course,
    Priority,
    Subtask,
    Task,
    TaskStatus,
    TaskType,
    task_tags,
)
from ..schemas import (
    ReorderIn,
    SubtaskIn,
    SubtaskOut,
    SubtaskUpdate,
    TaskCreate,
    TaskDetail,
    TaskMove,
    TaskPage,
    TaskUpdate,
)
from ..services import tasks as svc
from .semesters import current_semester

router = APIRouter(tags=["tasks"])

SortField = Literal["due_at", "priority", "course", "status", "title", "created_at", "position"]


@router.get("/tasks", response_model=TaskPage)
def list_tasks(
    user: CurrentUser,
    db: DB,
    semester_id: int | None = Query(None, description="По умолчанию — текущий семестр"),
    course_id: list[int] = Query(default_factory=list),
    status_: list[TaskStatus] = Query(default_factory=list, alias="status"),
    priority: list[Priority] = Query(default_factory=list),
    type_: list[TaskType] = Query(default_factory=list, alias="type"),
    tag_id: list[int] = Query(default_factory=list),
    due_from: datetime | None = None,
    due_to: datetime | None = None,
    overdue: bool = False,
    q: str | None = Query(None, max_length=100, description="Поиск по названию и описанию"),
    sort: SortField = "position",
    order: Literal["asc", "desc"] = "asc",
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> TaskPage:
    if semester_id is None:
        semester = current_semester(db, user)
        if semester is None:
            return TaskPage(items=[], total=0)
        semester_id = semester.id
    else:
        own_semester(db, user, semester_id)

    stmt = svc.with_relations(select(Task).join(Course).where(Course.semester_id == semester_id))
    if course_id:
        stmt = stmt.where(Task.course_id.in_(course_id))
    if status_:
        stmt = stmt.where(Task.status.in_(status_))
    if priority:
        stmt = stmt.where(Task.priority.in_(priority))
    if type_:
        stmt = stmt.where(Task.type.in_(type_))
    if tag_id:
        stmt = stmt.where(Task.id.in_(select(task_tags.c.task_id).where(task_tags.c.tag_id.in_(tag_id))))
    if due_from:
        stmt = stmt.where(Task.due_at >= due_from)
    if due_to:
        stmt = stmt.where(Task.due_at <= due_to)
    if overdue:
        stmt = stmt.where(Task.status.in_(ACTIVE_STATUSES), Task.due_at < utcnow())
    if q:
        pattern = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(Task.title).like(pattern), func.lower(Task.description).like(pattern)))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    priority_rank = {Priority.high: 0, Priority.medium: 1, Priority.low: 2}
    status_rank = {TaskStatus.todo: 0, TaskStatus.in_progress: 1, TaskStatus.review: 2, TaskStatus.done: 3}
    columns = {
        "due_at": Task.due_at,
        "title": func.lower(Task.title),
        "created_at": Task.created_at,
        "position": Task.position,
        "course": func.lower(Course.title),
    }
    if sort in columns:
        column = columns[sort]
        ordering = column.desc() if order == "desc" else column.asc()
        if sort == "due_at":  # задачи без срока — в конце
            stmt = stmt.order_by(Task.due_at.is_(None), ordering, Task.id)
        else:
            stmt = stmt.order_by(ordering, Task.id)
        items = db.scalars(stmt.offset(offset).limit(limit)).all()
    else:  # priority / status — порядок по смыслу, а не по алфавиту
        rank = priority_rank if sort == "priority" else status_rank
        field = "priority" if sort == "priority" else "status"
        items = sorted(
            db.scalars(stmt).all(),
            key=lambda t: (rank[getattr(t, field)], t.due_at is None, t.due_at or utcnow(), t.id),
            reverse=order == "desc",
        )[offset : offset + limit]
    return TaskPage(items=[svc.to_out(t) for t in items], total=total)


def _resolve_tags(db: DB, user: CurrentUser, tag_ids: list[int]) -> list:
    return [own_tag(db, user, tag_id) for tag_id in dict.fromkeys(tag_ids)]


@router.post("/tasks", response_model=TaskDetail, status_code=status.HTTP_201_CREATED)
def create_task(data: TaskCreate, user: CurrentUser, db: DB) -> TaskDetail:
    course = own_course(db, user, data.course_id)
    ensure_writable(course.semester)
    values = data.model_dump(exclude={"tag_ids", "status"})
    task = Task(**values)
    task.title = task.title.strip()
    task.status = TaskStatus.todo
    task.tags = _resolve_tags(db, user, data.tag_ids)
    svc.apply_status(task, data.status)
    task.position = svc.next_position(db, course.semester_id, task.status)
    db.add(task)
    db.commit()
    db.refresh(task)
    return svc.to_detail(task)


@router.get("/tasks/{task_id}", response_model=TaskDetail)
def get_task(task_id: int, user: CurrentUser, db: DB) -> TaskDetail:
    return svc.to_detail(own_task(db, user, task_id))


@router.patch("/tasks/{task_id}", response_model=TaskDetail)
def update_task(task_id: int, data: TaskUpdate, user: CurrentUser, db: DB) -> TaskDetail:
    task = own_task(db, user, task_id)
    ensure_writable(task.course.semester)
    values = data.model_dump(exclude_unset=True)

    if "course_id" in values and values["course_id"] != task.course_id:
        new_course = own_course(db, user, values["course_id"])
        if new_course.semester_id != task.course.semester_id:
            raise ApiError(409, "other_semester", "Задачу можно перенести только в дисциплину того же семестра")
        task.course = new_course
    values.pop("course_id", None)

    if "tag_ids" in values:
        task.tags = _resolve_tags(db, user, values.pop("tag_ids") or [])

    if values.get("status") is not None and values["status"] != task.status:
        svc.move(db, task, values["status"], svc.next_position(db, task.course.semester_id, values["status"]))
    values.pop("status", None)

    grade_set = "grade" in values
    grade = values.pop("grade", None)

    nullable = {"description", "due_at", "estimate_hours"}
    for key, value in values.items():
        if value is None and key not in nullable:
            continue
        setattr(task, key, value.strip() if isinstance(value, str) and key == "title" else value)

    if grade_set:
        svc.set_grade(task, grade)
    db.commit()
    db.refresh(task)
    return svc.to_detail(task)


@router.patch("/tasks/{task_id}/move", response_model=TaskDetail)
def move_task(task_id: int, data: TaskMove, user: CurrentUser, db: DB) -> TaskDetail:
    """UC-07, ФТ-17: перенос карточки между колонками и внутри колонки."""
    task = own_task(db, user, task_id)
    ensure_writable(task.course.semester)
    svc.move(db, task, data.status, data.position)
    db.commit()
    db.refresh(task)
    return svc.to_detail(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, user: CurrentUser, db: DB) -> None:
    task = own_task(db, user, task_id)
    ensure_writable(task.course.semester)
    db.delete(task)
    db.commit()


# ---------- Чек-лист (UC-08, ФТ-12) ----------


@router.post("/tasks/{task_id}/subtasks", response_model=SubtaskOut, status_code=status.HTTP_201_CREATED)
def add_subtask(task_id: int, data: SubtaskIn, user: CurrentUser, db: DB) -> SubtaskOut:
    task = own_task(db, user, task_id)
    ensure_writable(task.course.semester)
    position = max((s.position for s in task.subtasks), default=-1) + 1
    subtask = Subtask(task_id=task.id, title=data.title.strip(), position=position)
    db.add(subtask)
    db.commit()
    return SubtaskOut.model_validate(subtask)


@router.post("/tasks/{task_id}/subtasks/reorder", response_model=list[SubtaskOut])
def reorder_subtasks(task_id: int, data: ReorderIn, user: CurrentUser, db: DB) -> list[SubtaskOut]:
    task = own_task(db, user, task_id)
    ensure_writable(task.course.semester)
    by_id = {s.id: s for s in task.subtasks}
    if set(data.ids) != set(by_id):
        raise ApiError(422, "validation_error", "Нужно передать все подзадачи задачи")
    for index, subtask_id in enumerate(data.ids):
        by_id[subtask_id].position = index
    db.commit()
    db.refresh(task)
    return [SubtaskOut.model_validate(s) for s in task.subtasks]


@router.patch("/subtasks/{subtask_id}", response_model=SubtaskOut)
def update_subtask(subtask_id: int, data: SubtaskUpdate, user: CurrentUser, db: DB) -> SubtaskOut:
    subtask = own_subtask(db, user, subtask_id)
    ensure_writable(subtask.task.course.semester)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(subtask, key, value.strip() if isinstance(value, str) else value)
    db.commit()
    return SubtaskOut.model_validate(subtask)


@router.delete("/subtasks/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subtask(subtask_id: int, user: CurrentUser, db: DB) -> None:
    subtask = own_subtask(db, user, subtask_id)
    ensure_writable(subtask.task.course.semester)
    db.delete(subtask)
    db.commit()
