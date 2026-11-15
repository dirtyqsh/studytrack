// Карточка задачи для доски и строка задачи для списков дашборда

import type { Task } from "../api/types";
import { useApp, useTimeZone } from "../auth/AppContext";
import { formatShort, relativeDue } from "../lib/dates";
import { PRIORITY, TYPE_TITLE } from "../lib/labels";
import { IconChecklist, IconFlag } from "./Icons";

export function DueBadge({ task }: { task: Task }) {
  const tz = useTimeZone();
  if (!task.due_at) return <span className="badge">Без срока</span>;
  if (task.is_overdue) return <span className="badge badge-danger">Просрочено · {formatShort(task.due_at, tz)}</span>;
  if (task.status === "done") return <span className="badge">Срок был {formatShort(task.due_at, tz)}</span>;
  return <span className="badge">До {formatShort(task.due_at, tz)}</span>;
}

export function TaskCardBody({ task }: { task: Task }) {
  const { openTask } = useApp();
  return (
    <>
      <div className="card-course">
        <span className="dot" style={{ background: task.course.color }} />
        {task.course.title}
      </div>
      <button
        type="button"
        className="card-title"
        onClick={() => openTask(task.id)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {task.title}
      </button>
      <div className="card-badges">
        <span className="badge">{TYPE_TITLE[task.type]}</span>
        <DueBadge task={task} />
        {task.tags.map((tag) => (
          <span key={tag.id} className="badge badge-tag" style={{ color: tag.color, borderColor: tag.color }}>
            {tag.name}
          </span>
        ))}
      </div>
      <div className="card-meta">
        <span className="prio" style={{ color: PRIORITY[task.priority].color }}>
          <IconFlag /> {PRIORITY[task.priority].title}
        </span>
        {task.subtasks_total > 0 && (
          <span className="check-count" title="Чек-лист">
            <IconChecklist size={14} /> {task.subtasks_done}/{task.subtasks_total}
          </span>
        )}
        {task.status === "done" && task.grade !== null && <span className="grade">Оценка {task.grade}</span>}
      </div>
    </>
  );
}

export function TaskRow({ task, danger = false }: { task: Task; danger?: boolean }) {
  const { openTask } = useApp();
  const tz = useTimeZone();
  return (
    <button type="button" className={`task-row${danger ? " task-row-danger" : ""}`} onClick={() => openTask(task.id)}>
      <span className="dot" style={{ background: task.course.color }} />
      <span className="task-row-main">
        <span className="task-row-title">{task.title}</span>
        <span className="muted small">
          {task.course.title} · {TYPE_TITLE[task.type]}
        </span>
      </span>
      {task.due_at && (
        <span className={`task-row-due${danger ? " text-danger" : ""}`}>
          {formatShort(task.due_at, tz)}
          <span className="small">{relativeDue(task.due_at, tz)}</span>
        </span>
      )}
    </button>
  );
}
