"""ORM-модели. Схема соответствует разделу «Схема БД» отчёта по работе 2."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, UTCDateTime, utcnow


class TaskStatus(enum.StrEnum):
    todo = "todo"  # Нужно сделать
    in_progress = "in_progress"  # В работе
    review = "review"  # На проверке
    done = "done"  # Сдано


class TaskType(enum.StrEnum):
    lab = "lab"
    practice = "practice"
    homework = "homework"
    coursework = "coursework"
    exam = "exam"
    other = "other"


class Priority(enum.StrEnum):
    high = "high"
    medium = "medium"
    low = "low"


class ControlType(enum.StrEnum):
    credit = "credit"  # зачёт
    graded_credit = "graded_credit"  # дифференцированный зачёт
    exam = "exam"  # экзамен


class Channel(enum.StrEnum):
    in_app = "in_app"
    email = "email"


ACTIVE_STATUSES = (TaskStatus.todo, TaskStatus.in_progress)


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    return Enum(cls, name=name, native_enum=False, length=20, validate_strings=True)


task_tags = Table(
    "task_tags",
    Base.metadata,
    Column("task_id", ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100))
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Moscow")
    remind_days: Mapped[str] = mapped_column(String(50), default="1,3")
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    semesters: Mapped[list[Semester]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    tags: Mapped[list[Tag]] = relationship(back_populates="user", cascade="all, delete-orphan", passive_deletes=True)

    @property
    def remind_days_list(self) -> list[int]:
        return sorted({int(x) for x in self.remind_days.split(",") if x.strip().isdigit()})


class RefreshToken(Base):
    """Выданные refresh-токены: позволяют выйти из системы и отозвать сессию."""

    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # jti
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class Semester(Base):
    __tablename__ = "semesters"
    __table_args__ = (CheckConstraint("start_date <= end_date", name="ck_semester_dates"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(100))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    user: Mapped[User] = relationship(back_populates="semesters")
    courses: Mapped[list[Course]] = relationship(
        back_populates="semester",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Course.title",
    )


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    semester_id: Mapped[int] = mapped_column(ForeignKey("semesters.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(150))
    teacher: Mapped[str | None] = mapped_column(String(150), nullable=True)
    control_type: Mapped[ControlType] = mapped_column(_enum(ControlType, "control_type"), default=ControlType.credit)
    color: Mapped[str] = mapped_column(String(7), default="#3346D3")

    semester: Mapped[Semester] = relationship(back_populates="courses")
    tasks: Mapped[list[Task]] = relationship(
        back_populates="course", cascade="all, delete-orphan", passive_deletes=True
    )


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_course_status_position", "course_id", "status", "position"),
        Index("ix_tasks_due_at", "due_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[TaskType] = mapped_column(_enum(TaskType, "task_type"), default=TaskType.other)
    status: Mapped[TaskStatus] = mapped_column(_enum(TaskStatus, "task_status"), default=TaskStatus.todo)
    priority: Mapped[Priority] = mapped_column(_enum(Priority, "priority"), default=Priority.medium)
    due_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    estimate_hours: Mapped[Decimal | None] = mapped_column(Numeric(5, 1), nullable=True)
    grade: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    course: Mapped[Course] = relationship(back_populates="tasks")
    subtasks: Mapped[list[Subtask]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Subtask.position",
    )
    tags: Mapped[list[Tag]] = relationship(secondary=task_tags, back_populates="tasks")

    @property
    def is_overdue(self) -> bool:
        return self.due_at is not None and self.status in ACTIVE_STATUSES and self.due_at < utcnow()


class Subtask(Base):
    __tablename__ = "subtasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)

    task: Mapped[Task] = relationship(back_populates="subtasks")


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_tags_user_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(7), default="#8A91A0")

    user: Mapped[User] = relationship(back_populates="tags")
    tasks: Mapped[list[Task]] = relationship(secondary=task_tags, back_populates="tags")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        # БП: по одной задаче и одному интервалу — не более одного напоминания на канал
        UniqueConstraint("task_id", "offset_days", "channel", name="uq_notification_once"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    offset_days: Mapped[int] = mapped_column(Integer)
    channel: Mapped[Channel] = mapped_column(_enum(Channel, "channel"), default=Channel.in_app)
    message: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    task: Mapped[Task] = relationship()


def new_jti() -> str:
    return str(uuid.uuid4())
