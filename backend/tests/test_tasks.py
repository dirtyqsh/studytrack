"""US-04…US-09, US-13, US-14: задачи, доска, оценки, чек-листы, фильтры."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from .conftest import API, auth_headers, make_task, register


def iso(delta_days: float) -> str:
    return (datetime.now(UTC) + timedelta(days=delta_days)).isoformat()


def test_create_task_defaults(client, headers, course):
    task = make_task(client, headers, course["id"], title="  ЛР 3. Нормализация  ", type="lab", priority="high")
    assert task["title"] == "ЛР 3. Нормализация"
    assert task["status"] == "todo"
    assert task["course"]["color"] == "#1C6FD1"
    assert task["is_overdue"] is False
    assert task["subtasks"] == []


def test_create_task_validation(client, headers, course):
    response = client.post(f"{API}/tasks", json={"course_id": course["id"], "title": ""}, headers=headers)
    assert response.status_code == 422
    response = client.post(f"{API}/tasks", json={"course_id": 999, "title": "X"}, headers=headers)
    assert response.status_code == 404


def test_overdue_flag_depends_on_status(client, headers, course):
    task = make_task(client, headers, course["id"], due_at=iso(-2))
    assert task["is_overdue"] is True
    moved = client.patch(f"{API}/tasks/{task['id']}/move", json={"status": "review", "position": 0}, headers=headers)
    assert moved.json()["is_overdue"] is False


def test_move_reorders_columns(client, headers, course):
    a = make_task(client, headers, course["id"], title="A")
    b = make_task(client, headers, course["id"], title="B")
    c = make_task(client, headers, course["id"], title="C")
    # C в начало колонки
    client.patch(f"{API}/tasks/{c['id']}/move", json={"status": "todo", "position": 0}, headers=headers)
    titles = [t["title"] for t in client.get(f"{API}/tasks?status=todo", headers=headers).json()["items"]]
    assert titles == ["C", "A", "B"]
    # A в «В работе»
    client.patch(f"{API}/tasks/{a['id']}/move", json={"status": "in_progress", "position": 5}, headers=headers)
    todo = client.get(f"{API}/tasks?status=todo", headers=headers).json()["items"]
    assert [(t["title"], t["position"]) for t in todo] == [("C", 0), ("B", 1)]
    progress = client.get(f"{API}/tasks?status=in_progress", headers=headers).json()["items"]
    assert [(t["title"], t["position"]) for t in progress] == [("A", 0)]
    assert b["position"] == 1


def test_done_sets_completed_and_grade_rules(client, headers, course):
    task = make_task(client, headers, course["id"])
    # оценка до «Сдано» запрещена (БП-02)
    early = client.patch(f"{API}/tasks/{task['id']}", json={"grade": 5}, headers=headers)
    assert early.status_code == 409
    done = client.patch(f"{API}/tasks/{task['id']}", json={"status": "done", "grade": 5}, headers=headers).json()
    assert done["completed_at"] is not None
    assert done["grade"] == 5
    # возврат из «Сдано» очищает дату и оценку (БП-04)
    back = client.patch(
        f"{API}/tasks/{task['id']}/move", json={"status": "in_progress", "position": 0}, headers=headers
    )
    assert back.json()["completed_at"] is None
    assert back.json()["grade"] is None


def test_update_task_fields_and_course_change(client, headers, semester, course):
    other_course = client.post(
        f"{API}/semesters/{semester['id']}/courses", json={"title": "Сети"}, headers=headers
    ).json()
    task = make_task(client, headers, course["id"], due_at=iso(3), estimate_hours=4)
    updated = client.patch(
        f"{API}/tasks/{task['id']}",
        json={"title": "Новое", "description": "Описание", "due_at": None, "course_id": other_course["id"]},
        headers=headers,
    ).json()
    assert updated["title"] == "Новое"
    assert updated["due_at"] is None
    assert updated["course_id"] == other_course["id"]
    assert updated["estimate_hours"] == 4


def test_cannot_move_task_to_other_semester(client, headers, course):
    spring = client.post(
        f"{API}/semesters",
        json={"title": "Весна", "start_date": "2027-02-01", "end_date": "2027-06-30"},
        headers=headers,
    ).json()
    spring_course = client.post(f"{API}/semesters/{spring['id']}/courses", json={"title": "X"}, headers=headers).json()
    task = make_task(client, headers, course["id"])
    response = client.patch(f"{API}/tasks/{task['id']}", json={"course_id": spring_course["id"]}, headers=headers)
    assert response.status_code == 409


def test_subtasks_checklist(client, headers, course):
    task = make_task(client, headers, course["id"])
    first = client.post(f"{API}/tasks/{task['id']}/subtasks", json={"title": "Выписать ФЗ"}, headers=headers).json()
    second = client.post(f"{API}/tasks/{task['id']}/subtasks", json={"title": "Привести к 3НФ"}, headers=headers).json()
    client.patch(f"{API}/subtasks/{first['id']}", json={"is_done": True}, headers=headers)
    detail = client.get(f"{API}/tasks/{task['id']}", headers=headers).json()
    assert (detail["subtasks_done"], detail["subtasks_total"]) == (1, 2)
    reordered = client.post(
        f"{API}/tasks/{task['id']}/subtasks/reorder", json={"ids": [second["id"], first["id"]]}, headers=headers
    ).json()
    assert [s["title"] for s in reordered] == ["Привести к 3НФ", "Выписать ФЗ"]
    bad = client.post(f"{API}/tasks/{task['id']}/subtasks/reorder", json={"ids": [first["id"]]}, headers=headers)
    assert bad.status_code == 422
    assert client.delete(f"{API}/subtasks/{first['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/tasks/{task['id']}", headers=headers).json()["subtasks_total"] == 1


def test_tags_on_tasks_and_filter(client, headers, course):
    tag = client.post(f"{API}/tags", json={"name": "курсовая", "color": "#BE185D"}, headers=headers).json()
    duplicate = client.post(f"{API}/tags", json={"name": "курсовая"}, headers=headers)
    assert duplicate.status_code == 409
    tagged = make_task(client, headers, course["id"], title="С меткой", tag_ids=[tag["id"]])
    make_task(client, headers, course["id"], title="Без метки")
    assert tagged["tags"][0]["name"] == "курсовая"
    found = client.get(f"{API}/tasks?tag_id={tag['id']}", headers=headers).json()
    assert [t["title"] for t in found["items"]] == ["С меткой"]
    renamed = client.patch(f"{API}/tags/{tag['id']}", json={"name": "КР"}, headers=headers)
    assert renamed.json()["name"] == "КР"
    assert client.delete(f"{API}/tags/{tag['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/tasks/{tagged['id']}", headers=headers).json()["tags"] == []


def test_search_filters_and_sorting(client, headers, course):
    make_task(
        client, headers, course["id"], title="Реферат", description="Про нормализацию", due_at=iso(10), priority="low"
    )
    make_task(client, headers, course["id"], title="ЛР 1", due_at=iso(-1), priority="high", type="lab")
    make_task(client, headers, course["id"], title="Без срока", priority="medium")

    search = client.get(f"{API}/tasks?q=НОРМАЛИЗ", headers=headers).json()
    assert [t["title"] for t in search["items"]] == ["Реферат"]
    overdue = client.get(f"{API}/tasks?overdue=true", headers=headers).json()
    assert [t["title"] for t in overdue["items"]] == ["ЛР 1"]
    by_due = client.get(f"{API}/tasks?sort=due_at", headers=headers).json()
    assert [t["title"] for t in by_due["items"]] == ["ЛР 1", "Реферат", "Без срока"]
    by_priority = client.get(f"{API}/tasks?sort=priority", headers=headers).json()
    assert [t["priority"] for t in by_priority["items"]] == ["high", "medium", "low"]
    by_status = client.get(f"{API}/tasks?sort=status&order=desc", headers=headers).json()
    assert by_status["total"] == 3
    labs = client.get(f"{API}/tasks?type=lab&priority=high", headers=headers).json()
    assert labs["total"] == 1
    window = client.get(
        f"{API}/tasks", params={"due_from": iso(0), "due_to": iso(30), "sort": "title"}, headers=headers
    ).json()
    assert [t["title"] for t in window["items"]] == ["Реферат"]
    paged = client.get(f"{API}/tasks?sort=title&limit=1&offset=1", headers=headers).json()
    assert paged["total"] == 3 and len(paged["items"]) == 1


def test_tasks_of_other_user_are_hidden(client, headers, course):
    task = make_task(client, headers, course["id"])
    other = auth_headers(register(client, email="other@example.ru"))
    assert client.get(f"{API}/tasks/{task['id']}", headers=other).status_code == 404
    assert client.patch(f"{API}/tasks/{task['id']}", json={"title": "X"}, headers=other).status_code == 404
    assert client.delete(f"{API}/tasks/{task['id']}", headers=other).status_code == 404
    assert client.get(f"{API}/tasks", headers=other).json() == {"items": [], "total": 0}


def test_delete_task(client, headers, course):
    task = make_task(client, headers, course["id"])
    assert client.delete(f"{API}/tasks/{task['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/tasks/{task['id']}", headers=headers).status_code == 404


def test_not_found_message_agrees_with_gender(client, headers):
    response = client.get(f"{API}/tasks/999999", headers=headers)
    assert response.status_code == 404
    assert response.json() == {"code": "not_found", "message": "Задача не найдена"}
