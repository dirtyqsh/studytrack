// Работа с датами в часовом поясе пользователя (Т-08: даты ДД.ММ.ГГГГ, время в поясе из профиля)

import { plural } from "./labels";

/** Части даты (год, месяц, день, часы, минуты) в заданном поясе. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Ключ дня YYYY-MM-DD в поясе пользователя. */
export function dayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Значения для полей <input type="date"> и <input type="time">. */
export function toInputs(iso: string | null, timeZone: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "23:59" };
  const p = zonedParts(new Date(iso), timeZone);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Переводит «настенное» время в поясе пользователя в UTC ISO-строку. */
export function fromInputs(date: string, time: string, timeZone: string): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "23:59").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Смещение пояса в этот момент: разница между «как показано в поясе» и UTC
  const shown = zonedParts(new Date(guess), timeZone);
  const shownUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
  return new Date(guess - (shownUtc - guess)).toISOString();
}

export function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatShort(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "short" })
    .format(new Date(iso))
    .replace(".", "");
}

/** Сколько календарных дней до срока в поясе пользователя (отрицательно — просрочено). */
export function daysUntil(iso: string, timeZone: string): number {
  const today = dayKey(new Date(), timeZone);
  const due = dayKey(new Date(iso), timeZone);
  return Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
}

export function relativeDue(iso: string, timeZone: string): string {
  const days = daysUntil(iso, timeZone);
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  if (days === -1) return "вчера";
  if (days > 0) return `через ${days} ${plural(days, "день", "дня", "дней")}`;
  const n = -days;
  return `${n} ${plural(n, "день", "дня", "дней")} назад`;
}

export function todayLong(timeZone: string): string {
  const text = new Intl.DateTimeFormat("ru-RU", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(
    new Date(),
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function greeting(timeZone: string): string {
  const hour = zonedParts(new Date(), timeZone).hour;
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}
