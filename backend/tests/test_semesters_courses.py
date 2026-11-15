"""US-03, US-15, ФТ-06…ФТ-08: семестры и дисциплины."""

from __future__ import annotations

from .conftest import API, auth_headers, make_task, register


def test_first_semester_becomes_current(client, headers, semester):
    assert semester["is_current"] is True
    current = client.get(f"{API}/semesters/current", headers=headers)
    assert current.json()["id"] == semester["id"]


def test_only_one_current_semester(client, headers, semester):
    spring = client.post(
        f"{API}/semesters",
        json={"title": "Весна 2027", "start_date": "2027-02-01", "end_date": "2027-06-30", "is_current": True},
        headers=headers,
    ).json()
    items = client.get(f"{API}/semesters", headers=headers).json()
    assert [s["is_current"] for s in items if s["id"] == spring["id"]] == [True]
    assert [s["is_current"] for s in items if s["id"] == semester["id"]] == [False]


def test_semester_dates_validation(client, headers):
    response = client.post(
        f"{API}/semesters",
        json={"title": "X", "start_date": "2027-02-01", "end_date": "2026-01-01"},
        headers=headers,
    )
    assert response.status_code == 422


def test_archived_semester_is_read_only(client, headers, semester, course):
    archived = client.patch(f"{API}/semesters/{semester['id']}", json={"is_archived": True}, headers=headers)
    assert archived.status_code == 200
    assert archived.json()["is_current"] is False
    response = client.post(f"{API}/tasks", json={"course_id": course["id"], "title": "ЛР"}, headers=headers)
    assert response.status_code == 409
    assert response.json()["code"] == "semester_archived"
    make_current = client.patch(f"{API}/semesters/{semester['id']}", json={"is_current": True}, headers=headers)
    assert make_current.status_code == 409


def test_course_crud_and_task_count(client, headers, semester, course):
    make_task(client, headers, course["id"])
    courses = client.get(f"{API}/semesters/{semester['id']}/courses", headers=headers).json()
    assert courses[0]["task_count"] == 1
    updated = client.patch(f"{API}/courses/{course['id']}", json={"color": "#FF0000"}, headers=headers)
    assert updated.json()["color"] == "#FF0000"
    bad_color = client.patch(f"{API}/courses/{course['id']}", json={"color": "red"}, headers=headers)
    assert bad_color.status_code == 422


def test_delete_course_with_tasks_requires_force(client, headers, course):
    make_task(client, headers, course["id"])
    response = client.delete(f"{API}/courses/{course['id']}", headers=headers)
    assert response.status_code == 409
    assert "1 задач" in response.json()["message"]
    assert client.delete(f"{API}/courses/{course['id']}?force=true", headers=headers).status_code == 204
    assert client.get(f"{API}/courses/{course['id']}", headers=headers).status_code == 404


def test_other_user_cannot_see_my_data(client, headers, semester, course):
    other = auth_headers(register(client, email="other@example.ru"))
    assert client.get(f"{API}/semesters/{semester['id']}", headers=other).status_code == 404
    assert client.get(f"{API}/courses/{course['id']}", headers=other).status_code == 404
    assert client.get(f"{API}/semesters", headers=other).json() == []


def test_delete_semester_cascades(client, headers, semester, course):
    task = make_task(client, headers, course["id"])
    assert client.delete(f"{API}/semesters/{semester['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/tasks/{task['id']}", headers=headers).status_code == 404
    assert client.get(f"{API}/semesters/current", headers=headers).status_code == 404
