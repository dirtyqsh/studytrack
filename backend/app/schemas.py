"""Pydantic-схемы запросов и ответов API."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .models import Channel, ControlType, Priority, TaskStatus, TaskType

HEX_COLOR = r"^#[0-9A-Fa-f]{6}$"


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Аутентификация ----------


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Время жизни access-токена, секунд")


class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# ---------- Пользователь ----------


class UserOut(ORM):
    id: int
    email: EmailStr
    name: str
    timezone: str
    remind_days: list[int] = Field(validation_alias="remind_days_list")
    email_notifications: bool
    created_at: datetime


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    timezone: str | None = None
    remind_days: list[int] | None = Field(default=None, max_length=5)
    email_notifications: bool | None = None

    @field_validator("timezone")
    @classmethod
    def _tz(cls, value: str | None) -> str | None:
        if value is not None and value not in available_timezones():
            raise ValueError("неизвестный часовой пояс")
        return value

    @field_validator("remind_days")
    @classmethod
    def _days(cls, value: list[int] | None) -> list[int] | None:
        if value is not None and any(d < 0 or d > 30 for d in value):
            raise ValueError("интервал напоминания — от 0 до 30 дней")
        return value


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ---------- Семестры и дисциплины ----------


class SemesterBase(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _dates(self) -> SemesterBase:
        if self.start_date > self.end_date:
            raise ValueError("дата начала позже даты окончания")
        return self


class SemesterCreate(SemesterBase):
    is_current: bool = False


class SemesterUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool | None = None
    is_archived: bool | None = None


class SemesterOut(ORM):
    id: int
    title: str
    start_date: date
    end_date: date
    is_current: bool
    is_archived: bool
    course_count: int = 0
    task_count: int = 0


class CourseBase(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    teacher: str | None = Field(default=None, max_length=150)
    control_type: ControlType = ControlType.credit
    color: str = Field(default="#3346D3", pattern=HEX_COLOR)


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    teacher: str | None = Field(default=None, max_length=150)
    control_type: ControlType | None = None
    color: str | None = Field(default=None, pattern=HEX_COLOR)


class CourseOut(ORM):
    id: int
    semester_id: int
    title: str
    teacher: str | None
    control_type: ControlType
    color: str
    task_count: int = 0


class CourseBrief(ORM):
    id: int
    title: str
    color: str


# ---------- Метки ----------


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(default="#8A91A0", pattern=HEX_COLOR)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color: str | None = Field(default=None, pattern=HEX_COLOR)


class TagOut(ORM):
    id: int
    name: str
    color: str


# ---------- Задачи ----------


class SubtaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class SubtaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    is_done: bool | None = None


class SubtaskOut(ORM):
    id: int
    title: str
    is_done: bool
    position: int


class ReorderIn(BaseModel):
    ids: list[int]


class TaskCreate(BaseModel):
    course_id: int
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    type: TaskType = TaskType.other
    priority: Priority = Priority.medium
    status: TaskStatus = TaskStatus.todo
    due_at: datetime | None = None
    estimate_hours: float | None = Field(default=None, ge=0, le=999)
    tag_ids: list[int] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    course_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    type: TaskType | None = None
    priority: Priority | None = None
    status: TaskStatus | None = None
    due_at: datetime | None = None
    estimate_hours: float | None = Field(default=None, ge=0, le=999)
    grade: float | None = Field(default=None, ge=0, le=100)
    tag_ids: list[int] | None = None


class TaskMove(BaseModel):
    status: TaskStatus
    position: int = Field(ge=0)


class TaskOut(ORM):
    id: int
    course_id: int
    course: CourseBrief
    title: str
    description: str | None
    type: TaskType
    status: TaskStatus
    priority: Priority
    due_at: datetime | None
    estimate_hours: float | None
    grade: float | None
    position: int
    is_overdue: bool
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    tags: list[TagOut]
    subtasks_total: int = 0
    subtasks_done: int = 0


class TaskDetail(TaskOut):
    subtasks: list[SubtaskOut]


class TaskPage(BaseModel):
    items: list[TaskOut]
    total: int


# ---------- Дашборд и уведомления ----------


class StatusCounters(BaseModel):
    todo: int = 0
    in_progress: int = 0
    review: int = 0
    done: int = 0


class CourseProgress(BaseModel):
    course: CourseBrief
    total: int
    done: int
    avg_grade: float | None


class DashboardOut(BaseModel):
    semester: SemesterOut | None
    counters: StatusCounters
    overdue: list[TaskOut]
    today: list[TaskOut]
    upcoming: list[TaskOut]
    progress: list[CourseProgress]


class NotificationOut(ORM):
    id: int
    task_id: int
    offset_days: int
    channel: Channel
    message: str
    created_at: datetime
    is_read: bool


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread_count: int


class ErrorOut(BaseModel):
    code: str
    message: str
