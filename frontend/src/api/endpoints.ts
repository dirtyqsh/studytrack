// Вызовы REST API, сгруппированные по ресурсам (см. спецификацию OpenAPI)

import { http, request } from "./client";
import type {
  Course,
  ControlType,
  Dashboard,
  Notification,
  Priority,
  Semester,
  Subtask,
  Tag,
  TaskDetail,
  TaskInput,
  TaskPage,
  TaskStatus,
  TaskType,
  TokenPair,
  User,
} from "./types";

export const authApi = {
  register: (body: { email: string; password: string; name: string }) =>
    request<TokenPair>("POST", "/auth/register", { body, auth: false }),
  login: (body: { email: string; password: string }) =>
    request<TokenPair>("POST", "/auth/login", { body, auth: false }),
  logout: (refresh_token: string) => request<void>("POST", "/auth/logout", { body: { refresh_token }, auth: false }),
  requestReset: (email: string) =>
    request<{ message: string }>("POST", "/auth/password-reset/request", { body: { email }, auth: false }),
  confirmReset: (token: string, new_password: string) =>
    request<void>("POST", "/auth/password-reset/confirm", { body: { token, new_password }, auth: false }),
};

export const usersApi = {
  me: () => http.get<User>("/users/me"),
  update: (body: Partial<Pick<User, "name" | "timezone" | "remind_days" | "email_notifications">>) =>
    http.patch<User>("/users/me", body),
  changePassword: (current_password: string, new_password: string) =>
    http.post<void>("/users/me/password", { current_password, new_password }),
};

export interface SemesterInput {
  title?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
  is_archived?: boolean;
}

export const semestersApi = {
  list: () => http.get<Semester[]>("/semesters"),
  create: (body: SemesterInput) => http.post<Semester>("/semesters", body),
  update: (id: number, body: SemesterInput) => http.patch<Semester>(`/semesters/${id}`, body),
  remove: (id: number) => http.del(`/semesters/${id}`),
};

export interface CourseInput {
  title?: string;
  teacher?: string | null;
  control_type?: ControlType;
  color?: string;
}

export const coursesApi = {
  list: (semesterId: number) => http.get<Course[]>(`/semesters/${semesterId}/courses`),
  create: (semesterId: number, body: CourseInput) => http.post<Course>(`/semesters/${semesterId}/courses`, body),
  update: (id: number, body: CourseInput) => http.patch<Course>(`/courses/${id}`, body),
  remove: (id: number, force = false) => http.del(`/courses/${id}`, { force }),
};

export interface TaskQuery {
  semester_id?: number;
  course_id?: number[];
  status?: TaskStatus[];
  priority?: Priority[];
  type?: TaskType[];
  tag_id?: number[];
  due_from?: string;
  due_to?: string;
  overdue?: boolean;
  q?: string;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export const tasksApi = {
  list: (query: TaskQuery = {}) => http.get<TaskPage>("/tasks", { ...query }),
  get: (id: number) => http.get<TaskDetail>(`/tasks/${id}`),
  create: (body: TaskInput) => http.post<TaskDetail>("/tasks", body),
  update: (id: number, body: TaskInput) => http.patch<TaskDetail>(`/tasks/${id}`, body),
  move: (id: number, status: TaskStatus, position: number) =>
    http.patch<TaskDetail>(`/tasks/${id}/move`, { status, position }),
  remove: (id: number) => http.del(`/tasks/${id}`),
  addSubtask: (taskId: number, title: string) => http.post<Subtask>(`/tasks/${taskId}/subtasks`, { title }),
  updateSubtask: (id: number, body: { title?: string; is_done?: boolean }) =>
    http.patch<Subtask>(`/subtasks/${id}`, body),
  removeSubtask: (id: number) => http.del(`/subtasks/${id}`),
  reorderSubtasks: (taskId: number, ids: number[]) =>
    http.post<Subtask[]>(`/tasks/${taskId}/subtasks/reorder`, { ids }),
};

export const tagsApi = {
  list: () => http.get<Tag[]>("/tags"),
  create: (name: string, color?: string) => http.post<Tag>("/tags", { name, color }),
  remove: (id: number) => http.del(`/tags/${id}`),
};

export const dashboardApi = {
  get: () => http.get<Dashboard>("/dashboard"),
};

export const notificationsApi = {
  list: () => http.get<{ items: Notification[]; unread_count: number }>("/notifications"),
  read: (id: number) => http.patch<Notification>(`/notifications/${id}/read`),
  readAll: () => http.post<void>("/notifications/read-all"),
};
