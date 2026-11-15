"""Демонстрационные данные: python -m app.seed

Создаёт пользователя demo@studytrack.ru / demo12345 с текущим семестром,
шестью дисциплинами и задачами во всех статусах. Повторный запуск пересоздаёт данные.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select

from .database import SessionLocal, utcnow
from .models import (
    ControlType,
    Course,
    Notification,
    Priority,
    Semester,
    Subtask,
    Tag,
    Task,
    TaskStatus,
    TaskType,
    User,
)
from .security import hash_password

EMAIL = "demo@studytrack.ru"
PASSWORD = "demo12345"
TZ = "Asia/Krasnoyarsk"


def _due(days: int, hour: int = 23, minute: int = 59) -> datetime:
    tz = ZoneInfo(TZ)
    day = utcnow().astimezone(tz).date() + timedelta(days=days)
    return datetime.combine(day, time(hour, minute), tz)


def seed() -> None:
    with SessionLocal() as db:
        old = db.scalar(select(User).where(User.email == EMAIL))
        if old is not None:
            db.delete(old)
            db.commit()

        user = User(email=EMAIL, password_hash=hash_password(PASSWORD), name="Алексей", timezone=TZ, remind_days="1,3")
        db.add(user)
        db.flush()

        today = date.today()
        autumn = Semester(
            user_id=user.id,
            title="Осень 2026",
            start_date=date(today.year if today.month >= 9 else today.year - 1, 9, 1),
            end_date=date(today.year + 1 if today.month >= 9 else today.year, 1, 31),
            is_current=True,
        )
        spring = Semester(
            user_id=user.id,
            title="Весна 2026",
            start_date=date(2026, 2, 1),
            end_date=date(2026, 6, 30),
            is_archived=True,
        )
        db.add_all([autumn, spring])
        db.flush()

        courses = {
            "db": Course(
                semester_id=autumn.id,
                title="Базы данных",
                teacher="Петров А. В.",
                control_type=ControlType.exam,
                color="#1C6FD1",
            ),
            "se": Course(
                semester_id=autumn.id,
                title="Основы разработки коммерческого ПО",
                teacher="Смирнова Е. Н.",
                control_type=ControlType.graded_credit,
                color="#6741D9",
            ),
            "net": Course(
                semester_id=autumn.id,
                title="Компьютерные сети",
                teacher="Кузнецов Д. С.",
                control_type=ControlType.exam,
                color="#0B7D7F",
            ),
            "prob": Course(
                semester_id=autumn.id,
                title="Теория вероятностей",
                teacher="Орлова М. И.",
                control_type=ControlType.exam,
                color="#C2410C",
            ),
            "eng": Course(
                semester_id=autumn.id,
                title="Английский язык",
                teacher="Brown J.",
                control_type=ControlType.credit,
                color="#BE185D",
            ),
            "web": Course(
                semester_id=autumn.id,
                title="Web-программирование",
                teacher="Ильин П. Р.",
                control_type=ControlType.graded_credit,
                color="#2F855A",
            ),
        }
        db.add_all(courses.values())
        calculus = Course(
            semester_id=spring.id, title="Математический анализ", control_type=ControlType.exam, color="#8A91A0"
        )
        db.add(calculus)
        db.flush()
        # Архивный семестр: завершённые задачи, доступные только для просмотра
        for i, (title, day, grade) in enumerate(
            [("Типовой расчёт 1. Пределы", date(2026, 3, 20), 5), ("Типовой расчёт 2. Интегралы", date(2026, 5, 15), 4)]
        ):
            due = datetime.combine(day, time(20, 59), tzinfo=UTC)
            db.add(
                Task(
                    course_id=calculus.id,
                    title=title,
                    type=TaskType.homework,
                    status=TaskStatus.done,
                    priority=Priority.medium,
                    due_at=due,
                    grade=Decimal(grade),
                    position=i,
                    completed_at=due - timedelta(days=1),
                )
            )

        report = Tag(user_id=user.id, name="отчёт", color="#3346D3")
        defense = Tag(user_id=user.id, name="защита", color="#B54708")
        db.add_all([report, defense])

        L, P, H, OT = TaskType.lab, TaskType.practice, TaskType.homework, TaskType.other
        T, IP, R, D = TaskStatus.todo, TaskStatus.in_progress, TaskStatus.review, TaskStatus.done
        rows = [
            (
                "db",
                "ЛР 3. Нормализация схемы БД",
                L,
                IP,
                Priority.high,
                2,
                4,
                "Привести схему учебной БД «Библиотека» к 3НФ, обновить ER-диаграмму, защитить.",
                [
                    ("Выписать функциональные зависимости", True),
                    ("Привести схему ко 2НФ", True),
                    ("Привести к 3НФ и обновить ER-диаграмму", False),
                    ("Оформить отчёт", False),
                ],
                [report, defense],
                None,
            ),
            (
                "se",
                "ПР 3. Серверная часть приложения",
                P,
                IP,
                Priority.high,
                7,
                40,
                None,
                [("Модели и миграции", True), ("REST API", True), ("Тесты", False)],
                [report],
                None,
            ),
            ("prob", "ДЗ 4. Условная вероятность", H, T, Priority.high, -2, 3, None, [], [], None),
            (
                "net",
                "ЛР 2. Настройка VLAN",
                L,
                T,
                Priority.medium,
                5,
                4,
                None,
                [("Схема в Packet Tracer", False), ("Настройка коммутаторов", False), ("Отчёт", False)],
                [report],
                None,
            ),
            ("eng", "Эссе «My future profession»", H, T, Priority.low, 9, 2, None, [], [], None),
            ("prob", "Подготовка к коллоквиуму", OT, T, Priority.medium, 13, 6, None, [], [], None),
            ("se", "ПР 2. Проектирование: стек, БД, API", P, R, Priority.medium, -1, 40, None, [], [report], None),
            ("web", "ЛР 2. Адаптивная вёрстка", L, R, Priority.medium, -2, 5, None, [], [], None),
            ("se", "ПР 1. Техническое задание", P, D, Priority.high, -30, 40, None, [], [report], Decimal(5)),
            ("web", "ЛР 1. Вёрстка лендинга", L, D, Priority.medium, -21, 4, None, [], [], Decimal(5)),
            ("db", "ЛР 2. ER-диаграмма", L, D, Priority.high, -14, 3, None, [], [defense], Decimal(4)),
            ("db", "ЛР 1. SQL-запросы", L, D, Priority.medium, -28, 3, None, [], [], Decimal(5)),
        ]
        positions: dict[TaskStatus, int] = {}
        for key, title, ttype, status, prio, days, hours, desc, checklist, tags, grade in rows:
            task = Task(
                course_id=courses[key].id,
                title=title,
                type=ttype,
                status=status,
                priority=prio,
                due_at=_due(days),
                estimate_hours=Decimal(hours),
                description=desc,
                grade=grade,
                position=positions.get(status, 0),
                completed_at=_due(days, 18, 0) if status == D else None,
            )
            positions[status] = positions.get(status, 0) + 1
            task.tags = list(tags)
            task.subtasks = [Subtask(title=t, is_done=done, position=i) for i, (t, done) in enumerate(checklist)]
            db.add(task)
        db.flush()

        first = db.scalar(select(Task).where(Task.title.like("ЛР 3.%")))
        db.add(
            Notification(
                user_id=user.id, task_id=first.id, offset_days=2, message=f"Через 2 дня срок сдачи: {first.title}"
            )
        )
        db.commit()
    print(f"Демо-пользователь: {EMAIL} / {PASSWORD}")


if __name__ == "__main__":
    seed()
