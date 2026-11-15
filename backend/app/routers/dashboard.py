"""UC-12: дашборд (ФТ-25, ФТ-26)."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from sqlalchemy import select

from ..database import utcnow
from ..deps import DB, CurrentUser
from ..models import ACTIVE_STATUSES, Course, Task, TaskStatus
from ..schemas import CourseBrief, CourseProgress, DashboardOut, StatusCounters
from ..services.tasks import to_out, with_relations
from .semesters import _semester_out, current_semester

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user: CurrentUser, db: DB) -> DashboardOut:
    semester = current_semester(db, user)
    if semester is None:
        return DashboardOut(semester=None, counters=StatusCounters(), overdue=[], today=[], upcoming=[], progress=[])

    stmt = select(Task).join(Course).where(Course.semester_id == semester.id).order_by(Task.due_at)
    tasks = db.scalars(with_relations(stmt)).unique().all()

    counters = StatusCounters()
    for task in tasks:
        setattr(counters, task.status.value, getattr(counters, task.status.value) + 1)

    # Границы «сегодня» и «7 дней» считаются в часовом поясе пользователя (Т-08)
    tz = ZoneInfo(user.timezone)
    now = utcnow()
    today_local = now.astimezone(tz).date()
    end_today = datetime.combine(today_local, time.max, tz)
    end_week = datetime.combine(today_local + timedelta(days=7), time.max, tz)

    active = [t for t in tasks if t.status in ACTIVE_STATUSES and t.due_at is not None]
    overdue = [t for t in active if t.due_at < now]
    today = [t for t in active if now <= t.due_at <= end_today]
    upcoming = [t for t in active if end_today < t.due_at <= end_week]

    progress = []
    for course in semester.courses:
        course_tasks = [t for t in tasks if t.course_id == course.id]
        done = [t for t in course_tasks if t.status == TaskStatus.done]
        grades = [float(t.grade) for t in done if t.grade is not None]
        progress.append(
            CourseProgress(
                course=CourseBrief.model_validate(course),
                total=len(course_tasks),
                done=len(done),
                avg_grade=round(sum(grades) / len(grades), 2) if grades else None,
            )
        )

    return DashboardOut(
        semester=_semester_out(db, semester),
        counters=counters,
        overdue=[to_out(t) for t in overdue],
        today=[to_out(t) for t in today],
        upcoming=[to_out(t) for t in upcoming],
        progress=progress,
    )
