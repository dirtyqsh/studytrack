// Каркас приложения: боковое меню, верхняя панель, уведомления, карточка задачи

import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { notificationsApi } from "../api/endpoints";
import type { Notification } from "../api/types";
import { useApp, useTimeZone } from "../auth/AppContext";
import { formatDateTime } from "../lib/dates";
import {
  IconBell,
  IconBoard,
  IconBook,
  IconCalendar,
  IconHome,
  IconList,
  IconLogo,
  IconPlus,
  IconSearch,
  IconUser,
} from "./Icons";
import { TaskModal } from "./TaskModal";

const NAV = [
  { to: "/", label: "Дашборд", icon: IconHome, end: true },
  { to: "/board", label: "Доска", icon: IconBoard },
  { to: "/tasks", label: "Список задач", icon: IconList },
  { to: "/calendar", label: "Календарь", icon: IconCalendar },
  { to: "/courses", label: "Дисциплины", icon: IconBook },
  { to: "/profile", label: "Профиль", icon: IconUser },
];

function NotificationsBell() {
  const { openTask, version } = useApp();
  const tz = useTimeZone();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = () =>
    notificationsApi
      .list()
      .then((data) => {
        setItems(data.items);
        setUnread(data.unread_count);
      })
      .catch(() => undefined);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [version]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const pick = async (note: Notification) => {
    setOpen(false);
    if (!note.is_read) await notificationsApi.read(note.id).catch(() => undefined);
    load();
    openTask(note.task_id);
  };

  const readAll = async () => {
    await notificationsApi.readAll().catch(() => undefined);
    load();
  };

  return (
    <div className="bell" ref={ref}>
      <button
        type="button"
        className="icon-btn bordered"
        aria-label={unread ? `Уведомления: ${unread} новых` : "Уведомления"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <IconBell />
        {unread > 0 && <span className="bell-count">{unread}</span>}
      </button>
      {open && (
        <div className="dropdown" role="menu">
          <div className="dropdown-head">
            <strong>Уведомления</strong>
            {unread > 0 && (
              <button type="button" className="link-btn" onClick={readAll}>
                Прочитать все
              </button>
            )}
          </div>
          {items.length === 0 && <p className="muted small pad">Пока нет напоминаний</p>}
          {items.map((note) => (
            <button
              type="button"
              key={note.id}
              className={`dropdown-item${note.is_read ? "" : " unread"}`}
              onClick={() => pick(note)}
              role="menuitem"
            >
              <span>{note.message}</span>
              <span className="muted small">{formatDateTime(note.created_at, tz)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SemesterSelect() {
  const { semesters, semester, selectSemester, notify } = useApp();
  if (semesters.length === 0) return null;
  return (
    <>
      <label htmlFor="semester-select" className="sr-only">
        Семестр
      </label>
      <select
        id="semester-select"
        className="input semester-select"
        value={semester?.id ?? ""}
        onChange={(e) =>
          selectSemester(Number(e.target.value)).catch((err: ApiError) => notify(err.message, "error"))
        }
      >
        {semesters.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
            {s.is_archived ? " (архив)" : ""}
          </option>
        ))}
      </select>
    </>
  );
}

export function Layout() {
  const { user, semester, courses, newTask, readOnly, toasts } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const search = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/tasks?q=${encodeURIComponent(query.trim())}`);
  };

  const initials = (user?.name ?? "")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <IconLogo />
          <span>StudyTrack</span>
        </div>
        <nav aria-label="Разделы">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        {semester && (
          <div className="sidebar-card">
            <strong>{semester.title}</strong>
            <span className="muted">
              {courses.length} дисц. · {semester.task_count} задач
            </span>
          </div>
        )}
      </aside>

      <div className="main-col">
        <header className="topbar">
          <SemesterSelect />
          <form className="search hide-sm" role="search" onSubmit={search}>
            <IconSearch size={18} />
            <input
              type="search"
              aria-label="Поиск задач"
              placeholder="Поиск задач"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <span className="spacer" />
          <NotificationsBell />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => newTask()}
            disabled={!semester || readOnly || courses.length === 0}
            title={courses.length === 0 ? "Сначала добавьте дисциплину" : undefined}
          >
            <IconPlus size={18} /> <span className="hide-sm">Задача</span>
          </button>
          <NavLink to="/profile" className="avatar" aria-label={`Профиль: ${user?.name ?? ""}`}>
            {initials || "?"}
          </NavLink>
        </header>
        {readOnly && <div className="banner banner-top">Семестр «{semester?.title}» в архиве — данные доступны только для чтения.</div>}
        <main className="content">
          <Outlet />
        </main>
      </div>

      <TaskModal />
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
