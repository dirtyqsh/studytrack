"""UC-03, UC-04: семестры и дисциплины (ФТ-06…ФТ-08)."""

from __future__ import annotations

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..deps import DB, CurrentUser, ensure_writable, own_course, own_semester
from ..errors import ApiError, not_found
from ..models import Course, Semester, Task, User
from ..schemas import (
    CourseCreate,
    CourseOut,
    CourseUpdate,
    SemesterCreate,
    SemesterOut,
    SemesterUpdate,
)

router = APIRouter(tags=["semesters"])


def _semester_out(db: Session, semester: Semester) -> SemesterOut:
    out = SemesterOut.model_validate(semester)
    out.course_count = len(semester.courses)
    out.task_count = db.scalar(select(func.count(Task.id)).join(Course).where(Course.semester_id == semester.id)) or 0
    return out


def _course_out(db: Session, course: Course) -> CourseOut:
    out = CourseOut.model_validate(course)
    out.task_count = db.scalar(select(func.count(Task.id)).where(Task.course_id == course.id)) or 0
    return out


def _make_current(db: Session, user: User, semester: Semester) -> None:
    """БП-01: у пользователя ровно один текущий семестр."""
    for other in db.scalars(select(Semester).where(Semester.user_id == user.id)):
        other.is_current = other.id == semester.id


def current_semester(db: Session, user: User) -> Semester | None:
    return db.scalar(select(Semester).where(Semester.user_id == user.id, Semester.is_current.is_(True)))


# ---------- Семестры ----------


@router.get("/semesters", response_model=list[SemesterOut])
def list_semesters(user: CurrentUser, db: DB) -> list[SemesterOut]:
    items = db.scalars(select(Semester).where(Semester.user_id == user.id).order_by(Semester.start_date.desc())).all()
    return [_semester_out(db, s) for s in items]


@router.post("/semesters", response_model=SemesterOut, status_code=status.HTTP_201_CREATED)
def create_semester(data: SemesterCreate, user: CurrentUser, db: DB) -> SemesterOut:
    semester = Semester(user_id=user.id, title=data.title.strip(), start_date=data.start_date, end_date=data.end_date)
    db.add(semester)
    db.flush()
    # Первый семестр пользователя автоматически становится текущим
    if data.is_current or current_semester(db, user) is None:
        _make_current(db, user, semester)
    db.commit()
    return _semester_out(db, semester)


@router.get("/semesters/current", response_model=SemesterOut)
def get_current_semester(user: CurrentUser, db: DB) -> SemesterOut:
    semester = current_semester(db, user)
    if semester is None:
        raise not_found("Текущий семестр")
    return _semester_out(db, semester)


@router.get("/semesters/{semester_id}", response_model=SemesterOut)
def get_semester(semester_id: int, user: CurrentUser, db: DB) -> SemesterOut:
    return _semester_out(db, own_semester(db, user, semester_id))


@router.patch("/semesters/{semester_id}", response_model=SemesterOut)
def update_semester(semester_id: int, data: SemesterUpdate, user: CurrentUser, db: DB) -> SemesterOut:
    semester = own_semester(db, user, semester_id)
    values = data.model_dump(exclude_unset=True)
    archive = values.pop("is_archived", None)
    make_current = values.pop("is_current", None)
    for key, value in values.items():
        if value is not None:
            setattr(semester, key, value.strip() if isinstance(value, str) else value)
    if semester.start_date > semester.end_date:
        raise ApiError(422, "validation_error", "Дата начала позже даты окончания")
    if archive is not None:
        semester.is_archived = archive
        if archive and semester.is_current:
            semester.is_current = False
    if make_current:
        if semester.is_archived:
            raise ApiError(409, "semester_archived", "Архивный семестр нельзя сделать текущим")
        _make_current(db, user, semester)
    db.commit()
    return _semester_out(db, semester)


@router.delete("/semesters/{semester_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_semester(semester_id: int, user: CurrentUser, db: DB) -> None:
    semester = own_semester(db, user, semester_id)
    db.delete(semester)
    db.commit()


# ---------- Дисциплины ----------


@router.get("/semesters/{semester_id}/courses", response_model=list[CourseOut])
def list_courses(semester_id: int, user: CurrentUser, db: DB) -> list[CourseOut]:
    semester = own_semester(db, user, semester_id)
    return [_course_out(db, c) for c in semester.courses]


@router.post("/semesters/{semester_id}/courses", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(semester_id: int, data: CourseCreate, user: CurrentUser, db: DB) -> CourseOut:
    semester = own_semester(db, user, semester_id)
    ensure_writable(semester)
    course = Course(semester_id=semester.id, **data.model_dump())
    course.title = course.title.strip()
    db.add(course)
    db.commit()
    return _course_out(db, course)


@router.get("/courses/{course_id}", response_model=CourseOut)
def get_course(course_id: int, user: CurrentUser, db: DB) -> CourseOut:
    return _course_out(db, own_course(db, user, course_id))


@router.patch("/courses/{course_id}", response_model=CourseOut)
def update_course(course_id: int, data: CourseUpdate, user: CurrentUser, db: DB) -> CourseOut:
    course = own_course(db, user, course_id)
    ensure_writable(course.semester)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is not None or key == "teacher":
            setattr(course, key, value)
    db.commit()
    return _course_out(db, course)


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: int,
    user: CurrentUser,
    db: DB,
    force: bool = Query(False, description="Удалить вместе с задачами"),
) -> None:
    """ФТ-08: если у дисциплины есть задачи, без force=true вернётся 409 с их числом."""
    course = own_course(db, user, course_id)
    ensure_writable(course.semester)
    count = db.scalar(select(func.count(Task.id)).where(Task.course_id == course.id)) or 0
    if count and not force:
        raise ApiError(409, "course_has_tasks", f"У дисциплины {count} задач(и); они будут удалены вместе с ней")
    db.delete(course)
    db.commit()
