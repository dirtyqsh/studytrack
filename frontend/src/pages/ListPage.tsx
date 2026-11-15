// UC-10: список задач с поиском, фильтрами и сортировкой (ФТ-20…ФТ-22)

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { tasksApi, type TaskQuery } from "../api/endpoints";
import type { Priority, Task, TaskStatus, TaskType } from "../api/types";
import { useApp, useTimeZone } from "../auth/AppContext";
import { IconSearch } from "../components/Icons";
import { formatDateTime, relativeDue } from "../lib/dates";
import { PRIORITY, STATUSES, STATUS_TITLE, TYPE_TITLE } from "../lib/labels";

const COLUMNS: { key: string; title: string }[] = [
  { key: "title", title: "Задача" },
  { key: "course", title: "Дисциплина" },
  { key: "status", title: "Статус" },
  { key: "priority", title: "Приоритет" },
  { key: "due_at", title: "Срок" },
];

export function ListPage() {
  const { semester, courses, tags, version, openTask, notify } = useApp();
  const tz = useTimeZone();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("q") ?? "");

  const q = params.get("q") ?? "";
  const status = params.getAll("status") as TaskStatus[];
  const courseIds = params.getAll("course").map(Number);
  const priority = params.get("priority") as Priority | null;
  const type = params.get("type") as TaskType | null;
  const tagId = params.get("tag");
  const overdue = params.get("overdue") === "1";
  const sort = params.get("sort") ?? "due_at";
  const order = (params.get("order") as "asc" | "desc") ?? "asc";

  useEffect(() => setSearch(q), [q]);

  const update = (changes: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else if (value) next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const query = useMemo<TaskQuery>(
    () => ({
      semester_id: semester?.id,
      q: q || undefined,
      status: status.length ? status : undefined,
      course_id: courseIds.length ? courseIds : undefined,
      priority: priority ? [priority] : undefined,
      type: type ? [type] : undefined,
      tag_id: tagId ? [Number(tagId)] : undefined,
      overdue: overdue || undefined,
      sort,
      order,
      limit: 500,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [semester?.id, params.toString()],
  );

  useEffect(() => {
    if (!semester) return;
    setLoading(true);
    tasksApi
      .list(query)
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
      })
      .catch((err: ApiError) => notify(err.message, "error"))
      .finally(() => setLoading(false));
  }, [query, version, semester, notify]);

  // Поиск с небольшой задержкой, чтобы не отправлять запрос на каждый символ
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => update({ q: search.trim() || null }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggleSort = (key: string) => {
    if (sort === key) update({ order: order === "asc" ? "desc" : "asc" });
    else update({ sort: key, order: "asc" });
  };

  const toggleStatus = (key: TaskStatus) =>
    update({ status: status.includes(key) ? status.filter((s) => s !== key) : [...status, key] });

  const hasFilters = Boolean(q || status.length || courseIds.length || priority || type || tagId || overdue);

  if (!semester) return <div className="empty">Создайте семестр, чтобы начать работу со списком задач.</div>;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="muted">
            {semester.title} · найдено {total}
          </p>
          <h1>Список задач</h1>
        </div>
      </div>

      <div className="toolbar">
        <div className="search search-wide">
          <IconSearch size={16} />
          <label htmlFor="list-search" className="sr-only">
            Поиск по названию и описанию
          </label>
          <input
            id="list-search"
            type="search"
            placeholder="Поиск по названию и описанию"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filters" role="group" aria-label="Статус">
          {STATUSES.map((s) => (
            <button
              type="button"
              key={s.key}
              className={`chip-btn${status.includes(s.key) ? " active" : ""}`}
              aria-pressed={status.includes(s.key)}
              onClick={() => toggleStatus(s.key)}
            >
              <span className="dot" style={{ background: s.color }} />
              {s.title}
            </button>
          ))}
          <button
            type="button"
            className={`chip-btn chip-danger${overdue ? " active" : ""}`}
            aria-pressed={overdue}
            onClick={() => update({ overdue: overdue ? null : "1" })}
          >
            Просроченные
          </button>
        </div>
        <div className="filters">
          <label className="sr-only" htmlFor="f-course">
            Дисциплина
          </label>
          <select
            id="f-course"
            className="input input-sm"
            value={courseIds[0] ?? ""}
            onChange={(e) => update({ course: e.target.value ? [e.target.value] : null })}
          >
            <option value="">Все дисциплины</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="f-priority">
            Приоритет
          </label>
          <select
            id="f-priority"
            className="input input-sm"
            value={priority ?? ""}
            onChange={(e) => update({ priority: e.target.value || null })}
          >
            <option value="">Любой приоритет</option>
            {Object.entries(PRIORITY).map(([key, p]) => (
              <option key={key} value={key}>
                {p.title}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="f-type">
            Тип
          </label>
          <select
            id="f-type"
            className="input input-sm"
            value={type ?? ""}
            onChange={(e) => update({ type: e.target.value || null })}
          >
            <option value="">Любой тип</option>
            {Object.entries(TYPE_TITLE).map(([key, title]) => (
              <option key={key} value={key}>
                {title}
              </option>
            ))}
          </select>
          {tags.length > 0 && (
            <>
              <label className="sr-only" htmlFor="f-tag">
                Метка
              </label>
              <select
                id="f-tag"
                className="input input-sm"
                value={tagId ?? ""}
                onChange={(e) => update({ tag: e.target.value || null })}
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
          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams({}, { replace: true })}>
              Сбросить фильтры
            </button>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} aria-sort={sort === col.key ? (order === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="th-btn" onClick={() => toggleSort(col.key)}>
                    {col.title}
                    <span className="sort-mark">{sort === col.key ? (order === "asc" ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
              <th>Оценка</th>
            </tr>
          </thead>
          <tbody>
            {items.map((task) => (
              <tr key={task.id} className={task.is_overdue ? "row-overdue" : undefined}>
                <td>
                  <button type="button" className="link-btn strong" onClick={() => openTask(task.id)}>
                    {task.title}
                  </button>
                  <div className="muted small">
                    {TYPE_TITLE[task.type]}
                    {task.subtasks_total > 0 && ` · чек-лист ${task.subtasks_done}/${task.subtasks_total}`}
                    {task.tags.map((tag) => (
                      <span key={tag.id} className="badge badge-tag">
                        #{tag.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className="nowrap">
                    <span className="dot" style={{ background: task.course.color }} />
                    {task.course.title}
                  </span>
                </td>
                <td className="nowrap">{STATUS_TITLE[task.status]}</td>
                <td>
                  <span className="prio" style={{ color: PRIORITY[task.priority].color }}>
                    {PRIORITY[task.priority].title}
                  </span>
                </td>
                <td className="nowrap">
                  {task.due_at ? (
                    <>
                      {formatDateTime(task.due_at, tz)}
                      <div className={`small ${task.is_overdue ? "text-danger" : "muted"}`}>
                        {task.is_overdue ? "просрочено, " : ""}
                        {relativeDue(task.due_at, tz)}
                      </div>
                    </>
                  ) : (
                    <span className="muted">без срока</span>
                  )}
                </td>
                <td>{task.grade !== null ? task.grade.toLocaleString("ru-RU") : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && (
          <p className="empty-row">{hasFilters ? "По заданным условиям задач не найдено." : "Задач пока нет."}</p>
        )}
      </div>
    </div>
  );
}
