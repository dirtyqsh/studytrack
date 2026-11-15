// UC-12: дашборд (ФТ-25, ФТ-26)

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError } from "../api/client";
import { dashboardApi } from "../api/endpoints";
import type { Dashboard } from "../api/types";
import { useApp, useTimeZone } from "../auth/AppContext";
import { IconAlert } from "../components/Icons";
import { TaskRow } from "../components/TaskCard";
import { greeting, todayLong } from "../lib/dates";
import { STATUSES } from "../lib/labels";

export function DashboardPage() {
  const { user, version, notify } = useApp();
  const tz = useTimeZone();
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    dashboardApi
      .get()
      .then(setData)
      .catch((err: ApiError) => notify(err.message, "error"));
  }, [version, notify]);

  if (!data) return <div className="loading">Загрузка…</div>;

  if (!data.semester) {
    return (
      <div className="empty">
        <h1>Добро пожаловать, {user?.name}!</h1>
        <p className="muted">Начните с семестра и дисциплин — после этого появятся доска и дашборд.</p>
        <Link to="/courses" className="btn btn-primary">
          Создать семестр
        </Link>
      </div>
    );
  }

  const upcoming = [...data.today, ...data.upcoming];

  return (
    <div className="stack-lg">
      <div>
        <p className="muted">{todayLong(tz)}</p>
        <h1>
          {greeting(tz)}, {user?.name}
        </h1>
      </div>

      <div className="stat-grid">
        {STATUSES.map((s) => (
          <Link key={s.key} to={`/tasks?status=${s.key}`} className="stat">
            <span className="stat-label">
              <span className="dot" style={{ background: s.color }} />
              {s.title}
            </span>
            <span className="stat-value">{data.counters[s.key]}</span>
          </Link>
        ))}
      </div>

      <div className="dash-grid">
        <div className="stack-lg">
          <section className="panel panel-danger">
            <h2 className="panel-title text-danger">
              <IconAlert /> Просрочено · {data.overdue.length}
            </h2>
            {data.overdue.length === 0 && <p className="muted">Просроченных задач нет — так держать!</p>}
            {data.overdue.map((task) => (
              <TaskRow key={task.id} task={task} danger />
            ))}
          </section>
          <section className="panel">
            <h2 className="panel-title">Сегодня и ближайшие 7 дней · {upcoming.length}</h2>
            {upcoming.length === 0 && <p className="muted">На неделю сроков нет.</p>}
            {upcoming.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </section>
        </div>
        <section className="panel">
          <h2 className="panel-title">Прогресс по дисциплинам</h2>
          {data.progress.length === 0 && (
            <p className="muted">
              Дисциплин пока нет. <Link to="/courses">Добавить</Link>
            </p>
          )}
          {data.progress.map((p) => (
            <div key={p.course.id} className="progress-row">
              <div className="row-between">
                <span className="strong">{p.course.title}</span>
                <span className="muted small nowrap">
                  сдано {p.done} из {p.total}
                  {p.avg_grade !== null && ` · ср. ${p.avg_grade.toLocaleString("ru-RU")}`}
                </span>
              </div>
              <div className="progress">
                <div style={{ width: p.total ? `${(p.done / p.total) * 100}%` : 0, background: p.course.color }} />
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
