// UC-13: профиль и настройки напоминаний (ФТ-04)

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { usersApi } from "../api/endpoints";
import { useApp } from "../auth/AppContext";
import { IconLogout } from "../components/Icons";
import { formatDate } from "../lib/dates";

const TIMEZONES = [
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Magadan",
  "Asia/Kamchatka",
  "Europe/Minsk",
  "Asia/Almaty",
  "UTC",
];

const REMIND_OPTIONS = [0, 1, 2, 3, 5, 7, 14];

export function ProfilePage() {
  const { user, setUser, signOut, notify } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [timezone, setTimezone] = useState(user?.timezone ?? "Europe/Moscow");
  const [remind, setRemind] = useState<number[]>(user?.remind_days ?? [1, 3]);
  const [email, setEmail] = useState(user?.email_notifications ?? true);
  const [saving, setSaving] = useState(false);
  const [pwd, setPwd] = useState({ current: "", next: "", repeat: "" });
  const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({});

  if (!user) return null;

  const zones = TIMEZONES.includes(user.timezone) ? TIMEZONES : [user.timezone, ...TIMEZONES];

  const toggleDay = (day: number) =>
    setRemind((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      notify("Укажите имя", "error");
      return;
    }
    setSaving(true);
    try {
      const updated = await usersApi.update({
        name: name.trim(),
        timezone,
        remind_days: remind,
        email_notifications: email,
      });
      setUser(updated);
      notify("Настройки сохранены", "success");
    } catch (err) {
      notify((err as ApiError).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!pwd.current) errors.current = "Введите текущий пароль";
    if (pwd.next.length < 8) errors.next = "Не короче 8 символов";
    if (pwd.next !== pwd.repeat) errors.repeat = "Пароли не совпадают";
    setPwdErrors(errors);
    if (Object.keys(errors).length) return;
    try {
      await usersApi.changePassword(pwd.current, pwd.next);
      setPwd({ current: "", next: "", repeat: "" });
      notify("Пароль изменён", "success");
    } catch (err) {
      const e = err as ApiError;
      if (e.code === "wrong_password") setPwdErrors({ current: e.message });
      else notify(e.message, "error");
    }
  };

  const logout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="stack-lg profile">
      <div className="page-head">
        <div>
          <p className="muted">
            {user.email} · с нами с {formatDate(user.created_at, user.timezone)}
          </p>
          <h1>Профиль</h1>
        </div>
        <button type="button" className="btn btn-ghost" onClick={logout}>
          <IconLogout size={18} /> Выйти
        </button>
      </div>

      <form className="panel stack" onSubmit={save}>
        <h2 className="panel-title">Основное</h2>
        <div className="two-cols">
          <div className="field">
            <label className="label" htmlFor="p-name">
              Имя
            </label>
            <input id="p-name" className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="p-tz">
              Часовой пояс
            </label>
            <select id="p-tz" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <h2 className="panel-title">Напоминания о сроках</h2>
        <fieldset className="field">
          <legend className="label">Напоминать за (дней до срока, не больше пяти вариантов)</legend>
          <div className="filters">
            {REMIND_OPTIONS.map((day) => (
              <button
                type="button"
                key={day}
                className={`chip-btn${remind.includes(day) ? " active" : ""}`}
                aria-pressed={remind.includes(day)}
                disabled={!remind.includes(day) && remind.length >= 5}
                onClick={() => toggleDay(day)}
              >
                {day === 0 ? "в день срока" : day}
              </button>
            ))}
          </div>
          {remind.length === 0 && <span className="muted small">Напоминания выключены.</span>}
        </fieldset>
        <label className="switch">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          <span>Дублировать напоминания на e-mail ({user.email})</span>
        </label>
        <div className="right">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </form>

      <form className="panel stack" onSubmit={changePassword} noValidate>
        <h2 className="panel-title">Смена пароля</h2>
        <div className="three-cols">
          {(
            [
              ["current", "Текущий пароль", "current-password"],
              ["next", "Новый пароль", "new-password"],
              ["repeat", "Повторите новый", "new-password"],
            ] as const
          ).map(([key, label, auto]) => (
            <div className="field" key={key}>
              <label className="label" htmlFor={`pwd-${key}`}>
                {label}
              </label>
              <input
                id={`pwd-${key}`}
                type="password"
                autoComplete={auto}
                className={`input${pwdErrors[key] ? " invalid" : ""}`}
                value={pwd[key]}
                onChange={(e) => setPwd({ ...pwd, [key]: e.target.value })}
              />
              {pwdErrors[key] && <span className="error-text">{pwdErrors[key]}</span>}
            </div>
          ))}
        </div>
        <div className="right">
          <button type="submit" className="btn btn-ghost">
            Изменить пароль
          </button>
        </div>
      </form>
    </div>
  );
}
