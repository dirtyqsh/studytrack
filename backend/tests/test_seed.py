"""Демо-данные: скрипт заполнения работает и даёт согласованное состояние через API."""

from fastapi.testclient import TestClient

from app.seed import EMAIL, PASSWORD, seed
from tests.conftest import API


def test_seed_creates_demo_account(client: TestClient):
    seed()
    seed()  # повторный запуск пересоздаёт данные, а не дублирует их
    login = client.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    semesters = client.get(f"{API}/semesters", headers=headers).json()
    assert [s["title"] for s in semesters if s["is_current"]] == ["Осень 2026"]
    archived = next(s for s in semesters if s["is_archived"])
    assert archived["task_count"] == 2

    dashboard = client.get(f"{API}/dashboard", headers=headers).json()
    assert dashboard["counters"] == {"todo": 4, "in_progress": 2, "review": 2, "done": 4}
    assert len(dashboard["overdue"]) == 1
    assert client.get(f"{API}/notifications", headers=headers).json()["unread_count"] == 1
