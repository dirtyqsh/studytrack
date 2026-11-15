import type { ControlType, Priority, TaskStatus, TaskType } from "../api/types";

export const STATUSES: { key: TaskStatus; title: string; color: string }[] = [
  { key: "todo", title: "Нужно сделать", color: "#8A91A0" },
  { key: "in_progress", title: "В работе", color: "#3346D3" },
  { key: "review", title: "На проверке", color: "#B54708" },
  { key: "done", title: "Сдано", color: "#1E7B46" },
];

export const STATUS_TITLE: Record<TaskStatus, string> = Object.fromEntries(
  STATUSES.map((s) => [s.key, s.title]),
) as Record<TaskStatus, string>;

export const TYPE_TITLE: Record<TaskType, string> = {
  lab: "Лабораторная",
  practice: "Практическая",
  homework: "Домашнее задание",
  coursework: "Курсовая",
  exam: "Экзамен / зачёт",
  other: "Другое",
};

export const PRIORITY: Record<Priority, { title: string; color: string }> = {
  high: { title: "Высокий", color: "#B42318" },
  medium: { title: "Средний", color: "#B54708" },
  low: { title: "Низкий", color: "#5A6170" },
};

export const CONTROL_TITLE: Record<ControlType, string> = {
  credit: "Зачёт",
  graded_credit: "Дифференцированный зачёт",
  exam: "Экзамен",
};

export const COURSE_COLORS = [
  "#1C6FD1",
  "#6741D9",
  "#0B7D7F",
  "#C2410C",
  "#BE185D",
  "#2F855A",
  "#3346D3",
  "#8A6D00",
];

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
