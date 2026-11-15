"""Общие фикстуры: SQLite в памяти, тестовый клиент, зарегистрированный пользователь."""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["ARGON2_MEMORY_KIB"] = "1024"  # ускоряет хэширование в тестах
os.environ["ARGON2_ITERATIONS"] = "1"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only-0123456789"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

API = "/api/v1"


@pytest.fixture(autouse=True)
def _db():
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def register(client: TestClient, email: str = "student@example.ru", password: str = "secret123") -> dict:
    response = client.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "Алексей"})
    assert response.status_code == 201, response.text
    return response.json()


def auth_headers(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


@pytest.fixture
def tokens(client: TestClient) -> dict:
    return register(client)


@pytest.fixture
def headers(tokens: dict) -> dict:
    return auth_headers(tokens)


@pytest.fixture
def semester(client: TestClient, headers: dict) -> dict:
    response = client.post(
        f"{API}/semesters",
        json={"title": "Осень 2026", "start_date": "2026-09-01", "end_date": "2027-01-31"},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def course(client: TestClient, headers: dict, semester: dict) -> dict:
    response = client.post(
        f"{API}/semesters/{semester['id']}/courses",
        json={"title": "Базы данных", "teacher": "Иванов И. И.", "control_type": "exam", "color": "#1C6FD1"},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def make_task(client: TestClient, headers: dict, course_id: int, **fields) -> dict:
    body = {"course_id": course_id, "title": fields.pop("title", "ЛР 1"), **fields}
    response = client.post(f"{API}/tasks", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()
