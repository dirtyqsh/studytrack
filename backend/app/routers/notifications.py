"""UC-16: уведомления в интерфейсе (ФТ-27)."""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import func, select, update

from ..deps import DB, CurrentUser
from ..errors import not_found
from ..models import Channel, Notification
from ..schemas import NotificationList, NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationList)
def list_notifications(user: CurrentUser, db: DB, unread_only: bool = False, limit: int = 30) -> NotificationList:
    base = select(Notification).where(Notification.user_id == user.id, Notification.channel == Channel.in_app)
    if unread_only:
        base = base.where(Notification.is_read.is_(False))
    items = db.scalars(base.order_by(Notification.created_at.desc()).limit(min(limit, 100))).all()
    unread = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id,
            Notification.channel == Channel.in_app,
            Notification.is_read.is_(False),
        )
    )
    return NotificationList(items=[NotificationOut.model_validate(n) for n in items], unread_count=unread or 0)


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: int, user: CurrentUser, db: DB) -> NotificationOut:
    note = db.get(Notification, notification_id)
    if note is None or note.user_id != user.id:
        raise not_found("Уведомление")
    note.is_read = True
    db.commit()
    return NotificationOut.model_validate(note)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(user: CurrentUser, db: DB) -> None:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
