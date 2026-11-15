"""US-07, US-10, US-12: дашборд, профиль, напоминания."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.database import SessionLocal
from app.services import mailer, reminders
from app.services.reminders import build_message, generate_reminders

from .conftest import API, make_task


def at(days: float) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def test_dashboard_without_semester(client, headers):
    data = client.get(f"{API}/dashboard", headers=headers).json()
    assert data["semester"] is None
    assert data["counters"] == {"todo": 0, "in_progress": 0, "review": 0, "done": 0}


def test_dashboard_groups_and_progress(client, headers, course):
    make_task(client, headers, course["id"], title="Просрочена", due_at=at(-1))
    make_task(client, headers, course["id"], title="Через 3 дня", due_at=at(3))
    make_task(client, headers, course["id"], title="Через месяц", due_at=at(30))
    done = make_task(client, headers, course["id"], title="Сдана")
    client.patch(f"{API}/tasks/{done['id']}", json={"status": "done", "grade": 4}, headers=headers)
    second = make_task(client, headers, course["id"], title="Сдана 2")
    client.patch(f"{API}/tasks/{second['id']}", json={"status": "done", "grade": 5}, headers=headers)

    data = client.get(f"{API}/dashboard", headers=headers).json()
    assert data["counters"] == {"todo": 3, "in_progress": 0, "review": 0, "done": 2}
    assert [t["title"] for t in data["overdue"]] == ["Просрочена"]
    assert [t["title"] for t in data["upcoming"]] == ["Через 3 дня"]
    progress = data["progress"][0]
    assert (progress["total"], progress["done"], progress["avg_grade"]) == (5, 2, 4.5)


def test_profile_update_and_password_change(client, headers):
    updated = client.patch(
        f"{API}/users/me",
        json={
            "name": "Алексей К.",
            "timezone": "Asia/Krasnoyarsk",
            "remind_days": [3, 1, 3, 7],
            "email_notifications": True,
        },
        headers=headers,
    ).json()
    assert updated["remind_days"] == [1, 3, 7]
    assert updated["timezone"] == "Asia/Krasnoyarsk"
    bad_tz = client.patch(f"{API}/users/me", json={"timezone": "Mars/Base"}, headers=headers)
    assert bad_tz.status_code == 422
    wrong = client.post(
        f"{API}/users/me/password",
        json={"current_password": "nope12345", "new_password": "newpass123"},
        headers=headers,
    )
    assert wrong.status_code == 400
    ok = client.post(
        f"{API}/users/me/password",
        json={"current_password": "secret123", "new_password": "newpass123"},
        headers=headers,
    )
    assert ok.status_code == 204


def test_reminders_created_once_per_interval(client, headers, course):
    client.patch(f"{API}/users/me", json={"remind_days": [1, 3], "email_notifications": True}, headers=headers)
    soon = make_task(client, headers, course["id"], title="Скоро", due_at=at(0.5))
    make_task(client, headers, course["id"], title="Далеко", due_at=at(20))
    review = make_task(client, headers, course["id"], title="На проверке", due_at=at(0.5))
    client.patch(f"{API}/tasks/{review['id']}/move", json={"status": "review", "position": 0}, headers=headers)

    mailer.outbox.clear()
    with SessionLocal() as db:
        first = generate_reminders(db)
        second = generate_reminders(db)
    assert first == 2  # одно в интерфейсе и одно письмо
    assert second == 0  # повторно не создаются (БП-06)
    assert len(mailer.outbox) == 1
    assert "Скоро" in mailer.outbox[0]["Subject"]

    notes = client.get(f"{API}/notifications", headers=headers).json()
    assert notes["unread_count"] == 1
    assert notes["items"][0]["task_id"] == soon["id"]

    note_id = notes["items"][0]["id"]
    assert client.patch(f"{API}/notifications/{note_id}/read", headers=headers).json()["is_read"] is True
    assert client.get(f"{API}/notifications?unread_only=true", headers=headers).json()["items"] == []
    assert client.patch(f"{API}/notifications/9999/read", headers=headers).status_code == 404
    assert client.post(f"{API}/notifications/read-all", headers=headers).status_code == 204


def test_parallel_run_does_not_duplicate_reminders(client, headers, course, monkeypatch):
    """Второй процесс не видит записи до вставки: дубль отсекает уникальный ключ, письмо не уходит."""
    client.patch(f"{API}/users/me", json={"remind_days": [1], "email_notifications": True}, headers=headers)
    make_task(client, headers, course["id"], title="Первая", due_at=at(0.5))
    make_task(client, headers, course["id"], title="Вторая", due_at=at(0.6))
    mailer.outbox.clear()
    with SessionLocal() as db:
        assert generate_reminders(db) == 4
    monkeypatch.setattr(reminders, "_exists", lambda *args: False)
    with SessionLocal() as db:
        assert generate_reminders(db) == 0
    assert len(mailer.outbox) == 2  # по одному письму на задачу, без повторов
    assert client.get(f"{API}/notifications", headers=headers).json()["unread_count"] == 2


def test_reminder_messages():
    class T:
        title = "ЛР 3"

    assert build_message(T(), 0) == "Сегодня срок сдачи: ЛР 3"
    assert build_message(T(), 1) == "Через 1 день срок сдачи: ЛР 3"
    assert build_message(T(), 3) == "Через 3 дня срок сдачи: ЛР 3"
    assert build_message(T(), 5) == "Через 5 дней срок сдачи: ЛР 3"


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}
