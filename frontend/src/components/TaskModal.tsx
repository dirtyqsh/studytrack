// Карточка задачи (создание и редактирование): UC-05, UC-06, UC-08, UC-09

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { tagsApi, tasksApi } from "../api/endpoints";
import type { Priority, Subtask, TaskDetail, TaskStatus, TaskType } from "../api/types";
import { useApp, useTimeZone } from "../auth/AppContext";
import { formatDateTime, fromInputs, relativeDue, toInputs } from "../lib/dates";
import { PRIORITY, STATUSES, TYPE_TITLE } from "../lib/labels";
import { IconGrip, IconTrash } from "./Icons";
import { ConfirmDialog, Modal } from "./Modal";

interface FormState {
  title: string;
  course_id: number | "";
  type: TaskType;
  priority: Priority;
  status: TaskStatus;
  date: string;
  time: string;
  estimate: string;
  description: string;
  grade: string;
  tag_ids: number[];
}

function SubtaskItem({
  item,
  readOnly,
  onToggle,
  onRemove,
}: {
  item: Subtask;
  readOnly: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      className={`subtask${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {!readOnly && (
        <button type="button" className="grip" aria-label={`Переместить пункт «${item.title}»`} {...attributes} {...listeners}>
          <IconGrip size={16} />
        </button>
      )}
      <label className="subtask-label">
        <input type="checkbox" checked={item.is_done} onChange={onToggle} disabled={readOnly} />
        <span className={item.is_done ? "done-text" : ""}>{item.title}</span>
      </label>
      {!readOnly && (
        <button type="button" className="icon-btn small" onClick={onRemove} aria-label={`Удалить пункт «${item.title}»`}>
          <IconTrash size={16} />
        </button>
      )}
    </li>
  );
}

export function TaskModal() {
  const { modal, closeTask, courses, tags, reloadMeta, bump, notify, readOnly, openTask } = useApp();
  const tz = useTimeZone();
  const taskId = modal?.taskId ?? null;
  const isNew = taskId === null;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [newTag, setNewTag] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Загрузка задачи или подготовка пустой формы
  useEffect(() => {
    if (!modal) return;
    setErrors({});
    setConfirmDelete(false);
    if (modal.taskId === null) {
      const d = modal.defaults ?? {};
      const due = toInputs(d.due_at ?? null, tz);
      setTask(null);
      setForm({
        title: d.title ?? "",
        course_id: d.course_id ?? courses[0]?.id ?? "",
        type: d.type ?? "lab",
        priority: d.priority ?? "medium",
        status: d.status ?? "todo",
        date: due.date,
        time: due.time,
        estimate: "",
        description: "",
        grade: "",
        tag_ids: [],
      });
      return;
    }
    let cancelled = false;
    tasksApi
      .get(modal.taskId)
      .then((data) => {
        if (cancelled) return;
        const due = toInputs(data.due_at, tz);
        setTask(data);
        setForm({
          title: data.title,
          course_id: data.course_id,
          type: data.type,
          priority: data.priority,
          status: data.status,
          date: due.date,
          time: due.time,
          estimate: data.estimate_hours?.toString() ?? "",
          description: data.description ?? "",
          grade: data.grade?.toString() ?? "",
          tag_ids: data.tags.map((t) => t.id),
        });
      })
      .catch((err: ApiError) => {
        notify(err.message, "error");
        closeTask();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  if (!modal || !form) return null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Введите название задачи";
    if (!form.course_id) next.course_id = "Выберите дисциплину";
    if (form.estimate && (Number.isNaN(Number(form.estimate)) || Number(form.estimate) < 0))
      next.estimate = "Укажите число часов";
    if (form.grade && (Number.isNaN(Number(form.grade)) || Number(form.grade) < 0 || Number(form.grade) > 100))
      next.grade = "Оценка — число от 0 до 100";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const body = {
      title: form.title.trim(),
      course_id: Number(form.course_id),
      type: form.type,
      priority: form.priority,
      status: form.status,
      due_at: fromInputs(form.date, form.time, tz),
      estimate_hours: form.estimate ? Number(form.estimate) : null,
      description: form.description.trim() || null,
      tag_ids: form.tag_ids,
    };
    try {
      if (isNew) {
        const created = await tasksApi.create(body);
        notify("Задача создана", "success");
        bump();
        openTask(created.id); // остаёмся в карточке, чтобы можно было добавить чек-лист
      } else {
        await tasksApi.update(taskId, {
          ...body,
          grade: form.status === "done" && form.grade ? Number(form.grade) : null,
        });
        notify("Изменения сохранены", "success");
        bump();
        closeTask();
      }
    } catch (err) {
      // Данные формы не теряются (Т-04)
      notify((err as ApiError).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    try {
      await tasksApi.remove(taskId);
      notify("Задача удалена", "success");
      bump();
      closeTask();
    } catch (err) {
      notify((err as ApiError).message, "error");
    }
  };

  // ---- Чек-лист (изменения сохраняются сразу)
  const subtasks = task?.subtasks ?? [];
  const setSubtasks = (items: Subtask[]) => task && setTask({ ...task, subtasks: items });

  const addItem = async () => {
    const title = newItem.trim();
    if (!title || !task) return;
    try {
      const created = await tasksApi.addSubtask(task.id, title);
      setSubtasks([...subtasks, created]);
      setNewItem("");
      bump();
    } catch (err) {
      notify((err as ApiError).message, "error");
    }
  };

  const toggleItem = async (item: Subtask) => {
    setSubtasks(subtasks.map((s) => (s.id === item.id ? { ...s, is_done: !s.is_done } : s)));
    try {
      await tasksApi.updateSubtask(item.id, { is_done: !item.is_done });
      bump();
    } catch (err) {
      setSubtasks(subtasks);
      notify((err as ApiError).message, "error");
    }
  };

  const removeItem = async (item: Subtask) => {
    setSubtasks(subtasks.filter((s) => s.id !== item.id));
    try {
      await tasksApi.removeSubtask(item.id);
      bump();
    } catch (err) {
      setSubtasks(subtasks);
      notify((err as ApiError).message, "error");
    }
  };

  const onSubtaskDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!task || !over || active.id === over.id) return;
    const from = subtasks.findIndex((s) => s.id === active.id);
    const to = subtasks.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(subtasks, from, to);
    setSubtasks(reordered);
    try {
      await tasksApi.reorderSubtasks(task.id, reordered.map((s) => s.id));
    } catch (err) {
      setSubtasks(subtasks);
      notify((err as ApiError).message, "error");
    }
  };

  const addTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    try {
      const tag = await tagsApi.create(name);
      await reloadMeta();
      update("tag_ids", [...form.tag_ids, tag.id]);
      setNewTag("");
    } catch (err) {
      notify((err as ApiError).message, "error");
    }
  };

  const done = subtasks.filter((s) => s.is_done).length;
  const gradeEnabled = form.status === "done";
  const course = courses.find((c) => c.id === form.course_id);

  return (
    <Modal
      title={isNew ? "Новая задача" : "Карточка задачи"}
      onClose={closeTask}
      width={880}
      footer={
        <>
          {!isNew && !readOnly && (
            <button type="button" className="btn btn-text-danger" onClick={() => setConfirmDelete(true)}>
              Удалить задачу
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={closeTask}>
            {readOnly ? "Закрыть" : "Отмена"}
          </button>
          {!readOnly && (
            <button type="submit" form="task-form" className="btn btn-primary" disabled={saving}>
              {saving ? "Сохранение…" : isNew ? "Создать" : "Сохранить"}
            </button>
          )}
        </>
      }
    >
      {readOnly && <div className="banner">Семестр в архиве — задачу можно только просмотреть.</div>}
      <form id="task-form" className="task-form" onSubmit={submit} noValidate>
        <div className="task-head">
          {course && (
            <span className="chip" style={{ color: course.color, borderColor: course.color }}>
              <span className="dot" style={{ background: course.color }} />
              {course.title}
            </span>
          )}
          {task && (
            <span className="muted small">
              Создана {formatDateTime(task.created_at, tz)}
              {task.completed_at && ` · сдана ${formatDateTime(task.completed_at, tz)}`}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="task-title">Название задачи</label>
          <input
            id="task-title"
            className={`input input-lg${errors.title ? " invalid" : ""}`}
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Например, ЛР 3. Нормализация схемы БД"
            maxLength={200}
            autoFocus={isNew}
            disabled={readOnly}
          />
          {errors.title && <span className="error-text">{errors.title}</span>}
        </div>

        <div className="field">
          <span className="label" id="status-label">
            Статус
          </span>
          <div className="segmented" role="group" aria-labelledby="status-label">
            {STATUSES.map((s) => (
              <button
                type="button"
                key={s.key}
                className={form.status === s.key ? "active" : ""}
                aria-pressed={form.status === s.key}
                onClick={() => update("status", s.key)}
                disabled={readOnly}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>

        <div className="task-grid">
          <div className="task-main">
            <div className="field">
              <label htmlFor="task-desc">Описание</label>
              <textarea
                id="task-desc"
                className="input"
                rows={4}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                disabled={readOnly}
              />
            </div>

            {!isNew && (
              <div className="field">
                <div className="row-between">
                  <span className="label">Чек-лист</span>
                  <span className="muted small">
                    Выполнено {done} из {subtasks.length}
                  </span>
                </div>
                <div className="progress">
                  <div style={{ width: subtasks.length ? `${(done / subtasks.length) * 100}%` : 0 }} />
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSubtaskDragEnd}>
                  <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    <ul className="subtasks">
                      {subtasks.map((item) => (
                        <SubtaskItem
                          key={item.id}
                          item={item}
                          readOnly={readOnly}
                          onToggle={() => toggleItem(item)}
                          onRemove={() => removeItem(item)}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
                {!readOnly && (
                  <div className="inline-add">
                    <label htmlFor="new-item" className="sr-only">
                      Новый пункт чек-листа
                    </label>
                    <input
                      id="new-item"
                      className="input"
                      placeholder="Новый пункт"
                      value={newItem}
                      onChange={(e) => setNewItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addItem();
                        }
                      }}
                    />
                    <button type="button" className="btn btn-ghost" onClick={addItem}>
                      Добавить
                    </button>
                  </div>
                )}
              </div>
            )}
            {isNew && <p className="muted small">Чек-лист можно заполнить сразу после создания задачи.</p>}
          </div>

          <div className="task-side">
            <div className="field">
              <label htmlFor="task-course">Дисциплина</label>
              <select
                id="task-course"
                className={`input${errors.course_id ? " invalid" : ""}`}
                value={form.course_id}
                onChange={(e) => update("course_id", Number(e.target.value))}
                disabled={readOnly}
              >
                {courses.length === 0 && <option value="">Сначала добавьте дисциплину</option>}
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              {errors.course_id && <span className="error-text">{errors.course_id}</span>}
            </div>
            <div className="two-cols">
              <div className="field">
                <label htmlFor="task-type">Тип</label>
                <select
                  id="task-type"
                  className="input"
                  value={form.type}
                  onChange={(e) => update("type", e.target.value as TaskType)}
                  disabled={readOnly}
                >
                  {Object.entries(TYPE_TITLE).map(([key, title]) => (
                    <option key={key} value={key}>
                      {title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="task-priority">Приоритет</label>
                <select
                  id="task-priority"
                  className="input"
                  value={form.priority}
                  onChange={(e) => update("priority", e.target.value as Priority)}
                  disabled={readOnly}
                >
                  {Object.entries(PRIORITY).map(([key, p]) => (
                    <option key={key} value={key}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="two-cols">
              <div className="field">
                <label htmlFor="task-date">Срок сдачи</label>
                <input
                  id="task-date"
                  type="date"
                  className="input"
                  value={form.date}
                  onChange={(e) => update("date", e.target.value)}
                  disabled={readOnly}
                />
              </div>
              <div className="field">
                <label htmlFor="task-time">Время</label>
                <input
                  id="task-time"
                  type="time"
                  className="input"
                  value={form.time}
                  onChange={(e) => update("time", e.target.value)}
                  disabled={readOnly}
                />
              </div>
            </div>
            {task?.due_at && (
              <span className={`small ${task.is_overdue ? "text-danger" : "text-warn"}`}>
                {task.is_overdue ? "Просрочено: " : "Срок: "}
                {relativeDue(task.due_at, tz)}
              </span>
            )}
            <div className="field">
              <label htmlFor="task-estimate">Оценка трудоёмкости, ч</label>
              <input
                id="task-estimate"
                type="number"
                min={0}
                step={0.5}
                className={`input${errors.estimate ? " invalid" : ""}`}
                value={form.estimate}
                onChange={(e) => update("estimate", e.target.value)}
                disabled={readOnly}
              />
              {errors.estimate && <span className="error-text">{errors.estimate}</span>}
            </div>
            <div className="field">
              <span className="label">Метки</span>
              <div className="tag-picker">
                {tags.map((tag) => {
                  const active = form.tag_ids.includes(tag.id);
                  return (
                    <button
                      type="button"
                      key={tag.id}
                      className={`tag-toggle${active ? " active" : ""}`}
                      style={active ? { background: tag.color, borderColor: tag.color, color: "#fff" } : { color: tag.color, borderColor: tag.color }}
                      aria-pressed={active}
                      onClick={() =>
                        update("tag_ids", active ? form.tag_ids.filter((id) => id !== tag.id) : [...form.tag_ids, tag.id])
                      }
                      disabled={readOnly}
                    >
                      {active ? "✓ " : ""}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
              {!readOnly && (
                <div className="inline-add">
                  <label htmlFor="new-tag" className="sr-only">
                    Новая метка
                  </label>
                  <input
                    id="new-tag"
                    className="input input-sm"
                    placeholder="Новая метка"
                    value={newTag}
                    maxLength={50}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={addTag}>
                    +
                  </button>
                </div>
              )}
            </div>
            {!isNew && (
              <div className="field">
                <label htmlFor="task-grade">Полученная оценка</label>
                <input
                  id="task-grade"
                  className={`input${errors.grade ? " invalid" : ""}`}
                  placeholder="Например, 5 или 85"
                  value={form.grade}
                  onChange={(e) => update("grade", e.target.value)}
                  disabled={!gradeEnabled || readOnly}
                />
                {!gradeEnabled && <span className="muted small">Доступно после перевода в «Сдано»</span>}
                {errors.grade && <span className="error-text">{errors.grade}</span>}
              </div>
            )}
          </div>
        </div>
      </form>
      {confirmDelete && (
        <ConfirmDialog
          title="Удалить задачу?"
          text={`Задача «${form.title}» и её чек-лист будут удалены без возможности восстановления.`}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Modal>
  );
}
