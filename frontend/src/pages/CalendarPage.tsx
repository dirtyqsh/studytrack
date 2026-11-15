// UC-11: календарь сроков — месяц и неделя, перенос срока перетаскиванием (ФТ-23, ФТ-24)

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import { tasksApi } from "../api/endpoints";
import type { Task } from "../api/types";
import { useApp, useTimeZone } from "../auth/AppContext";
import { IconChevronLeft, IconChevronRight } from "../components/Icons";
import { dayKey, fromInputs, toInputs, zonedParts } from "../lib/dates";

type View = "month" | "week";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

// Календарная арифметика ведётся на «днях» в UTC, чтобы не зависеть от пояса браузера
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parseKey = (key: string) => Date.parse(`${key}T00:00:00Z`);
const addDays = (key: string, n: number) => keyOf(parseKey(key) + n * 86_400_000);
const mondayOf = (key: string) => addDays(key, -((new Date(parseKey(key)).getUTCDay() + 6) % 7));

function Chip({ task, disabled }: { task: Task; disabled: boolean }) {
  const { openTask } = useApp();
  const tz = useTimeZone();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled });
  const done = task.status === "done";
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`cal-chip${done ? " cal-chip-done" : ""}${task.is_overdue ? " cal-chip-overdue" : ""}${isDragging ? " card-ghost" : ""}`}
      style={{ borderLeftColor: task.course.color, background: `${task.course.color}14` }}
      title={`${task.course.title}: ${task.title}`}
      onClick={(e) => {
        e.stopPropagation();
        openTask(task.id);
      }}
      {...attributes}
      {...listeners}
    >
      <span className="cal-time">{toInputs(task.due_at, tz).time}</span>
      <span className="cal-title">{task.title}</span>
    </button>
  );
}

function DayCell({
  dateKey,
  tasks,
  outside,
  today,
  readOnly,
  tall,
}: {
  dateKey: string;
  tasks: Task[];
  outside: boolean;
  today: boolean;
  readOnly: boolean;
  tall: boolean;
}) {
  const { newTask, courses } = useApp();
  const tz = useTimeZone();
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const day = Number(dateKey.slice(8));
  const limit = tall ? 50 : 3;
  const canCreate = !readOnly && courses.length > 0;
  return (
    <div
      ref={setNodeRef}
      className={`cal-day${outside ? " cal-outside" : ""}${today ? " cal-today" : ""}${isOver ? " cal-over" : ""}${tall ? " cal-tall" : ""}`}
      onDoubleClick={() => canCreate && newTask({ due_at: fromInputs(dateKey, "23:59", tz) })}
      aria-label={dateKey}
    >
      <div className="cal-day-head">
        <span className="cal-num">{day}</span>
        {canCreate && (
          <button
            type="button"
            className="cal-add"
            aria-label={`Новая задача на ${dateKey.split("-").reverse().join(".")}`}
            onClick={() => newTask({ due_at: fromInputs(dateKey, "23:59", tz) })}
          >
            +
          </button>
        )}
      </div>
      {tasks.slice(0, limit).map((task) => (
        <Chip key={task.id} task={task} disabled={readOnly} />
      ))}
      {tasks.length > limit && <span className="cal-more">ещё {tasks.length - limit}</span>}
    </div>
  );
}

export function CalendarPage() {
  const { semester, version, bump, notify, readOnly, courses } = useApp();
  const tz = useTimeZone();
  const todayKey = dayKey(new Date(), tz);
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(todayKey); // любой день отображаемого периода
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dragged, setDragged] = useState<Task | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { days, title } = useMemo(() => {
    if (view === "week") {
      const start = mondayOf(anchor);
      const list = Array.from({ length: 7 }, (_, i) => addDays(start, i));
      const fmt = (k: string) => k.split("-").reverse().slice(0, 2).join(".");
      return { days: list, title: `${fmt(list[0])} — ${fmt(list[6])}.${list[6].slice(0, 4)}` };
    }
    const first = `${anchor.slice(0, 7)}-01`;
    const start = mondayOf(first);
    const month = anchor.slice(0, 7);
    const list: string[] = [];
    for (let k = start; list.length < 42; k = addDays(k, 1)) {
      list.push(k);
      if (list.length % 7 === 0 && addDays(k, 1).slice(0, 7) !== month && list.length >= 28) break;
    }
    return { days: list, title: `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}` };
  }, [view, anchor]);

  useEffect(() => {
    if (!semester) return;
    const from = fromInputs(days[0], "00:00", tz)!;
    const to = new Date(Date.parse(fromInputs(addDays(days[days.length - 1], 1), "00:00", tz)!) - 1000).toISOString();
    tasksApi
      .list({ semester_id: semester.id, due_from: from, due_to: to, sort: "due_at", limit: 1000 })
      .then((page) => setTasks(page.items))
      .catch((err: ApiError) => notify(err.message, "error"));
  }, [semester, days, tz, version, notify]);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.due_at || hidden.has(task.course_id)) continue;
      const key = dayKey(new Date(task.due_at), tz);
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [tasks, tz, hidden]);

  const shift = (dir: number) => {
    if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else {
      const [y, m] = anchor.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + dir, 1));
      setAnchor(keyOf(d.getTime()));
    }
  };

  // ФТ-24: перенос срока — день меняется, время сохраняется
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const task = tasks.find((t) => t.id === active.id);
    if (!task || !over || !task.due_at) return;
    const target = String(over.id);
    if (target === dayKey(new Date(task.due_at), tz)) return;
    const due = fromInputs(target, toInputs(task.due_at, tz).time, tz);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_at: due } : t)));
    try {
      await tasksApi.update(task.id, { due_at: due });
      notify(`Срок «${task.title}» перенесён на ${target.split("-").reverse().join(".")}`, "success");
      bump();
    } catch (err) {
      notify((err as ApiError).message, "error");
      bump();
    }
  };

  if (!semester) return <div className="empty">Создайте семестр, чтобы увидеть календарь сроков.</div>;

  const month = anchor.slice(0, 7);
  const nowParts = zonedParts(new Date(), tz);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="muted">{semester.title} · перетащите задачу на другой день, чтобы перенести срок</p>
          <h1>Календарь</h1>
        </div>
        <div className="row">
          <div className="segmented" role="group" aria-label="Вид календаря">
            <button type="button" className={view === "month" ? "active" : ""} onClick={() => setView("month")}>
              Месяц
            </button>
            <button type="button" className={view === "week" ? "active" : ""} onClick={() => setView("week")}>
              Неделя
            </button>
          </div>
        </div>
      </div>

      <div className="cal-toolbar">
        <div className="row">
          <button type="button" className="icon-btn bordered" aria-label="Назад" onClick={() => shift(-1)}>
            <IconChevronLeft />
          </button>
          <h2 className="cal-title-main">{title}</h2>
          <button type="button" className="icon-btn bordered" aria-label="Вперёд" onClick={() => shift(1)}>
            <IconChevronRight />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setAnchor(`${nowParts.year}-${String(nowParts.month).padStart(2, "0")}-${String(nowParts.day).padStart(2, "0")}`)}
          >
            Сегодня
          </button>
        </div>
        <div className="filters" role="group" aria-label="Дисциплины">
          {courses.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip-btn${hidden.has(c.id) ? "" : " active"}`}
              aria-pressed={!hidden.has(c.id)}
              onClick={() =>
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
                  return next;
                })
              }
            >
              <span className="dot" style={{ background: c.color }} />
              {c.title}
            </button>
          ))}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setDragged(tasks.find((t) => t.id === active.id) ?? null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragged(null)}
      >
        <div className="cal">
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-weekday">
              {d}
            </div>
          ))}
          {days.map((key) => (
            <DayCell
              key={key}
              dateKey={key}
              tasks={byDay.get(key) ?? []}
              outside={view === "month" && key.slice(0, 7) !== month}
              today={key === todayKey}
              readOnly={readOnly}
              tall={view === "week"}
            />
          ))}
        </div>
        <DragOverlay>
          {dragged && (
            <div className="cal-chip cal-chip-overlay" style={{ borderLeftColor: dragged.course.color }}>
              <span className="cal-title">{dragged.title}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
