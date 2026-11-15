"""Отправка писем через SMTP. Без настроенного SMTP письма пишутся в лог."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from ..config import get_settings

log = logging.getLogger("studytrack.mail")
outbox: list[EmailMessage] = []  # последние письма (для тестов и отладки)


def send_email(to: str, subject: str, body: str) -> bool:
    settings = get_settings()
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    outbox.append(msg)
    del outbox[:-50]
    if not settings.smtp_host:
        log.info("SMTP не настроен, письмо для %s: %s\n%s", to, subject, body)
        return True
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException):
        log.exception("Не удалось отправить письмо %s", to)
        return False
