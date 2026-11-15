"""ФТ-13: метки задач."""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import select

from ..deps import DB, CurrentUser, own_tag
from ..errors import ApiError
from ..models import Tag
from ..schemas import TagIn, TagOut, TagUpdate

router = APIRouter(prefix="/tags", tags=["tags"])


def _check_unique(db: DB, user_id: int, name: str, exclude_id: int | None = None) -> None:
    existing = db.scalar(select(Tag).where(Tag.user_id == user_id, Tag.name == name))
    if existing is not None and existing.id != exclude_id:
        raise ApiError(409, "tag_exists", "Метка с таким названием уже есть")


@router.get("", response_model=list[TagOut])
def list_tags(user: CurrentUser, db: DB) -> list[TagOut]:
    tags = db.scalars(select(Tag).where(Tag.user_id == user.id).order_by(Tag.name)).all()
    return [TagOut.model_validate(t) for t in tags]


@router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED)
def create_tag(data: TagIn, user: CurrentUser, db: DB) -> TagOut:
    name = data.name.strip()
    _check_unique(db, user.id, name)
    tag = Tag(user_id=user.id, name=name, color=data.color)
    db.add(tag)
    db.commit()
    return TagOut.model_validate(tag)


@router.patch("/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, data: TagUpdate, user: CurrentUser, db: DB) -> TagOut:
    tag = own_tag(db, user, tag_id)
    if data.name is not None:
        _check_unique(db, user.id, data.name.strip(), exclude_id=tag.id)
        tag.name = data.name.strip()
    if data.color is not None:
        tag.color = data.color
    db.commit()
    return TagOut.model_validate(tag)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: int, user: CurrentUser, db: DB) -> None:
    db.delete(own_tag(db, user, tag_id))
    db.commit()
