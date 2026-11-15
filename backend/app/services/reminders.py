"""Планировщик напоминаний (UC-14, ФТ-27, ФТ-28)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import SessionLocal, utcnow
from ..models import ACTIVE_STATUSES, Channel, Course, Notification, Semester, Task, User
from .mailer import send_email

log = logging.getLogger("studytrack.reminders")


def _days_word(n: int) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return "день"
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return "дня"
    return "дней"


def build_message(task: Task, offset: int) -> str:
    if offset == 0:
        return f"Сегодня срок сдачи: {task.title}"
    return f"Через {offset} {_days_word(offset)} срок сдачи: {task.title}"


def _exists(db: Session, task_id: int, offset: int, channel: Channel) -> bool:
    return (
        db.scalar(
            select(Notification.id).where(
                Notification.task_id == task_id,
                Notification.offset_days == offset,
                Notification.channel == channel,
            )
        )
        is not None
    )


def generate_reminders(db: Session, now: datetime | None = None) -> int:
    """Создаёт недостающие напоминания. Возвращает число новых записей.

    Правила: только активные задачи (БП-06), не архивный семестр, срок ещё не прошёл,
    до срока осталось не больше N дней, где N — интервал из профиля; по задаче и
    интервалу — не более одного напоминания на канал.
    """
    now = now or utcnow()
    created = 0
    users = db.scalars(select(User)).all()
    for user in users:
        offsets = user.remind_days_list
        if not offsets:
            continue
        horizon = now + timedelta(days=max(offsets) + 1)
        tasks = db.scalars(
            select(Task)
            .join(Course)
            .join(Semester)
            .where(
                Semester.user_id == user.id,
                Semester.is_archived.is_(False),
                Task.status.in_(ACTIVE_STATUSES),
                Task.due_at.is_not(None),
                Task.due_at > now,
                Task.due_at <= horizon,
            )
        ).all()
        for task in tasks:
            # Берём ближайший к сроку интервал, в окно которого уже вошли
            due_local = task.due_at.astimezone(ZoneInfo(user.timezone)).date()
            now_local = now.astimezone(ZoneInfo(user.timezone)).date()
            days_left = (due_local - now_local).days
            matching = [o for o in offsets if days_left <= o]
            if not matching:
                continue
            offset = min(matching)
            message = build_message(task, max(days_left, 0))
            channels = [Channel.in_app] + ([Channel.email] if user.email_notifications else [])
            for channel in channels:
                if _exists(db, task.id, offset, channel):
                    continue
                note = Notification(
                    user_id=user.id,
                    task_id=task.id,
                    offset_days=offset,
                    channel=channel,
                    message=message,
                    is_read=channel == Channel.email,
                )
                # Сначала фиксируем запись (savepoint): если её уже создал параллельный
                # процесс, уникальный ключ не даст вставить дубль и письмо не уйдёт повторно.
                try:
                    with db.begin_nested():
                        db.add(note)
                except IntegrityError:
                    continue
                db.commit()  # запись видна другим процессам до отправки письма
                created += 1
                if channel == Channel.email:
                    due_text = task.due_at.astimezone(ZoneInfo(user.timezone)).strftime("%d.%m.%Y %H:%M")
                    body = (
                        f"Здравствуйте, {user.name}!\n\n{message}.\n"
                        f"Дисциплина: {task.course.title}\nСрок: {due_text}\n\n"
                        f"Открыть StudyTrack: {get_settings().frontend_url}/board"
                    )
                    if send_email(user.email, f"StudyTrack: {message}", body):
                        note.sent_at = utcnow()
                        db.commit()
    db.commit()
    return created


def run_job() -> None:
    with SessionLocal() as db:
        count = generate_reminders(db)
        if count:
            log.info("Создано напоминаний: %s", count)


def start_scheduler() -> BackgroundScheduler | None:
    settings = get_settings()
    if not settings.scheduler_enabled:
        return None
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        run_job,
        "interval",
        minutes=settings.reminder_interval_minutes,
        id="reminders",
        next_run_time=utcnow() + timedelta(seconds=10),
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    return scheduler
