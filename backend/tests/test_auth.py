"""US-01, US-02, US-16: регистрация, вход, токены, восстановление пароля."""

from __future__ import annotations

import re

from app.security import hash_password, verify_password
from app.services import mailer

from .conftest import API, auth_headers, register


def test_register_returns_tokens_and_profile(client):
    tokens = register(client)
    assert tokens["token_type"] == "bearer"
    me = client.get(f"{API}/users/me", headers=auth_headers(tokens))
    assert me.status_code == 200
    assert me.json()["email"] == "student@example.ru"
    assert me.json()["remind_days"] == [1, 3]


def test_register_duplicate_email(client):
    register(client)
    response = client.post(
        f"{API}/auth/register", json={"email": "STUDENT@example.ru", "password": "secret123", "name": "X"}
    )
    assert response.status_code == 409
    assert response.json() == {"code": "email_taken", "message": "E-mail уже зарегистрирован"}


def test_register_short_password_is_validation_error(client):
    response = client.post(f"{API}/auth/register", json={"email": "a@b.ru", "password": "123", "name": "X"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert body["details"][0]["field"] == "password"


def test_login_success_and_wrong_password(client):
    register(client)
    ok = client.post(f"{API}/auth/login", json={"email": "student@example.ru", "password": "secret123"})
    assert ok.status_code == 200
    bad = client.post(f"{API}/auth/login", json={"email": "student@example.ru", "password": "wrong-pass"})
    assert bad.status_code == 401
    assert bad.json()["message"] == "Неверный e-mail или пароль"
    unknown = client.post(f"{API}/auth/login", json={"email": "nobody@example.ru", "password": "secret123"})
    assert unknown.json() == bad.json()


def test_protected_endpoint_requires_token(client):
    assert client.get(f"{API}/users/me").status_code == 401
    bad = client.get(f"{API}/users/me", headers={"Authorization": "Bearer garbage"})
    assert bad.status_code == 401


def test_refresh_rotates_token_and_logout_revokes(client):
    tokens = register(client)
    first = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert first.status_code == 200
    # старый refresh-токен после ротации недействителен
    again = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert again.status_code == 401
    new_refresh = first.json()["refresh_token"]
    assert client.post(f"{API}/auth/logout", json={"refresh_token": new_refresh}).status_code == 204
    assert client.post(f"{API}/auth/refresh", json={"refresh_token": new_refresh}).status_code == 401
    # повторный выход не падает
    assert client.post(f"{API}/auth/logout", json={"refresh_token": new_refresh}).status_code == 204


def test_access_token_cannot_be_used_as_refresh(client):
    tokens = register(client)
    response = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert response.status_code == 401


def test_password_reset_flow(client):
    register(client)
    mailer.outbox.clear()
    response = client.post(f"{API}/auth/password-reset/request", json={"email": "student@example.ru"})
    assert response.status_code == 202
    body = mailer.outbox[-1].get_content()
    token = re.search(r"token=([\w-]+)", body).group(1)

    confirm = client.post(f"{API}/auth/password-reset/confirm", json={"token": token, "new_password": "newpass123"})
    assert confirm.status_code == 204
    # ссылка одноразовая
    reuse = client.post(f"{API}/auth/password-reset/confirm", json={"token": token, "new_password": "other1234"})
    assert reuse.status_code == 400
    login = client.post(f"{API}/auth/login", json={"email": "student@example.ru", "password": "newpass123"})
    assert login.status_code == 200


def test_password_reset_unknown_email_looks_the_same(client):
    mailer.outbox.clear()
    response = client.post(f"{API}/auth/password-reset/request", json={"email": "ghost@example.ru"})
    assert response.status_code == 202
    assert mailer.outbox == []


def test_argon2_hash_format_and_verify():
    encoded = hash_password("secret123")
    assert encoded.startswith("$argon2id$v=19$")
    assert verify_password("secret123", encoded)
    assert not verify_password("secret124", encoded)
    assert not verify_password("secret123", "not-a-hash")


def test_validation_messages_are_russian(client):
    response = client.post(f"{API}/auth/register", json={"email": "not-an-email", "password": "123", "name": ""})
    assert response.status_code == 422
    body = response.json()
    fields = {d["field"]: d["message"] for d in body["details"]}
    assert fields["email"] == "некорректный адрес e-mail"
    assert fields["password"] == "не короче 8 символов"
    assert body["message"].startswith("Некорректное значение поля")
