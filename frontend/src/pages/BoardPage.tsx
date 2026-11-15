// UC-07: канбан-доска с перетаскиванием (ФТ-16…ФТ-19)

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { tasksApi } from "../api/endpoints";
import type { Priority, Task, TaskStatus } from "../api/types";
import { useApp } from "../auth/AppContext";
import { IconPlus } from "../components/Icons";
import { TaskCardBody } from "../components/TaskCard";
import { PRIORITY, STATUSES } from "../lib/labels";

type Columns = Record<TaskStatus, Task[]>;

const emptyColumns = (): Columns => ({ todo: [], in_progress: [], review: [], done: [] });

function SortableCard({ task, disabled }: { task: Task; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
    disabled,
    attributes: { roleDescription: "карточка задачи" },
  });
  return (
    <article
      ref={setNodeRef}
      className={`card${task.is_overdue ? " card-overdue" : ""}${isDragging ? " card-ghost" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <TaskCardBody task={task} />
    </article>
  );
}

function Column({
  status,
  title,
  color,
  tasks,
  readOnly,
  children,
}: {
  status: TaskStatus;
  title: string;
  color: string;
  tasks: Task[];
  readOnly: boolean;
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status}`, data: { status } });
  return (
    <section className={`column${isOver ? " column-over" : ""}`} ref={setNodeRef} aria-label={title}>
      <div className="column-head">
        <span className="dot" style={{ background: color }} />
        <h2>{title}</h2>
        <span className="count">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="column-body">
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} disabled={readOnly} />
          ))}
          {tasks.length === 0 && <p className="column-empty">{readOnly ? "Нет задач" : "Перетащите карточку сюда"}</p>}
        </div>
      </SortableContext>
      {children}
    </section>
  );
}

function QuickAdd({ onCreated }: { onCreated: () => void }) {
  const { courses, notify } = useApp();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState<number | "">("");

  useEffect(() => {
    if (courseId === "" && courses[0]) setCourseId(courses[0].id);
  }, [courses, courseId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !courseId) return;
    try {
      await tasksApi.create({ title: title.trim(), course_id: Number(courseId) });
      setTitle("");
      onCreated();
    } catch (err) {
      notify((err as ApiError).message, "error");
    }
  };

  if (!open) {
    return (
      <button type="button" className="quick-add-btn" onClick={() => setOpen(true)} disabled={courses.length === 0}>
        <IconPlus size={16} /> Добавить задачу
      </button>
    );
  }
  return (
    <form className="quick-add" onSubmit={submit}>
      <label htmlFor="quick-title" className="sr-only">
        Название новой задачи
      </label>
      <input
        id="quick-title"
        className="input input-sm"
        placeholder="Название задачи"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <label htmlFor="quick-course" className="sr-only">
        Дисциплина
      </label>
      <select
        id="quick-course"
        className="input input-sm"
        value={courseId}
        onChange={(e) => setCourseId(Number(e.target.value))}
      >
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      <div className="row">
        <button type="submit" className="btn btn-primary btn-sm">
          Добавить
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </form>
  );
}

export function BoardPage() {
  const { semester, courses, tags, version, bump, notify, readOnly } = useApp();
  const [columns, setColumns] = useState<Columns>(emptyColumns());
  const [loaded, setLoaded] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [startStatus, setStartStatus] = useState<TaskStatus | null>(null);
  const [courseFilter, setCourseFilter] = useState<number | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [tagFilter, setTagFilter] = useState<number | "">("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(() => {
    if (!semester) return;
    tasksApi
      .list({ semester_id: semester.id, sort: "position" })
      .then((page) => {
        const next = emptyColumns();
        page.items.forEach((t) => next[t.status].push(t));
        setColumns(next);
        setLoaded(true);
      })
      .catch((err: ApiError) => notify(err.message, "error"));
  }, [semester, notify]);

  useEffect(load, [load, version]);

  // ФТ-18: фильтры доски. Перетаскивание работает и при фильтре — позиция считается среди видимых карточек
  const visible = useMemo(() => {
    const keep = (t: Task) =>
      (courseFilter === "all" || t.course_id === courseFilter) &&
      (!priorityFilter || t.priority === priorityFilter) &&
      (!tagFilter || t.tags.some((tag) => tag.id === tagFilter));
    return Object.fromEntries(STATUSES.map((s) => [s.key, columns[s.key].filter(keep)])) as Columns;
  }, [columns, courseFilter, priorityFilter, tagFilter]);

  const findStatus = (id: string | number): TaskStatus | null => {
    if (typeof id === "string" && id.startsWith("column-")) return id.replace("column-", "") as TaskStatus;
    return STATUSES.find((s) => columns[s.key].some((t) => t.id === id))?.key ?? null;
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const status = findStatus(active.id);
    setStartStatus(status);
    setActiveTask(status ? (columns[status].find((t) => t.id === active.id) ?? null) : null);
  };

  // Карточка переходит в другую колонку уже во время перетаскивания
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findStatus(active.id);
    const to = findStatus(over.id);
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const task = prev[from].find((t) => t.id === active.id);
      if (!task) return prev;
      const target = prev[to].filter((t) => t.id !== task.id);
      const overIndex = target.findIndex((t) => t.id === over.id);
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, { ...task, status: to });
      return { ...prev, [from]: prev[from].filter((t) => t.id !== task.id), [to]: target };
    });
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveTask(null);
    if (!over) {
      load();
      return;
    }
    const status = findStatus(active.id);
    if (!status) return;
    const list = [...columns[status]];
    const oldIndex = list.findIndex((t) => t.id === active.id);
    const overIndex = list.findIndex((t) => t.id === over.id);
    const newIndex = overIndex >= 0 ? overIndex : list.length - 1;
    if (oldIndex !== newIndex) {
      const [moved] = list.splice(oldIndex, 1);
      list.splice(newIndex, 0, moved);
      setColumns((prev) => ({ ...prev, [status]: list }));
    }
    if (status === startStatus && oldIndex === newIndex) return;
    try {
      await tasksApi.move(Number(active.id), status, newIndex);
      if (status === "done" && startStatus !== "done") notify("Задача сдана. Оценку можно внести в карточке.", "success");
      bump();
    } catch (err) {
      // Ошибка сети или сервера: карточка возвращается на место (US-05)
      notify((err as ApiError).message, "error");
      load();
    }
  };

  if (!semester) return <div className="empty">Создайте семестр, чтобы начать работу с доской.</div>;

  const shown = STATUSES.reduce((sum, s) => sum + visible[s.key].length, 0);
  const total = STATUSES.reduce((sum, s) => sum + columns[s.key].length, 0);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="muted">
            {semester.title} · {shown} из {total} задач
          </p>
          <h1>Доска задач</h1>
        </div>
        <div className="filters" role="group" aria-label="Фильтры доски">
          <button
            type="button"
            className={`chip-btn${courseFilter === "all" ? " active" : ""}`}
            aria-pressed={courseFilter === "all"}
            onClick={() => setCourseFilter("all")}
          >
            Все дисциплины
          </button>
          {courses.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip-btn${courseFilter === c.id ? " active" : ""}`}
              aria-pressed={courseFilter === c.id}
              onClick={() => setCourseFilter(c.id)}
            >
              <span className="dot" style={{ background: c.color }} />
              {c.title}
            </button>
          ))}
          <label htmlFor="board-priority" className="sr-only">
            Приоритет
          </label>
          <select
            id="board-priority"
            className="input input-sm"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Priority | "")}
          >
            <option value="">Любой приоритет</option>
            {Object.entries(PRIORITY).map(([key, p]) => (
              <option key={key} value={key}>
                {p.title}
              </option>
            ))}
          </select>
          {tags.length > 0 && (
            <>
              <label htmlFor="board-tag" className="sr-only">
                Метка
              </label>
              <select
                id="board-tag"
                className="input input-sm"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Любая метка</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {!loaded ? (
        <div className="loading">Загрузка…</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveTask(null);
            load();
          }}
        >
          <div className="board">
            {STATUSES.map((s) => (
              <Column key={s.key} status={s.key} title={s.title} color={s.color} tasks={visible[s.key]} readOnly={readOnly}>
                {s.key === "todo" && !readOnly && <QuickAdd onCreated={bump} />}
              </Column>
            ))}
          </div>
          <DragOverlay>
            {activeTask && (
              <article className="card card-dragging">
                <TaskCardBody task={activeTask} />
              </article>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
