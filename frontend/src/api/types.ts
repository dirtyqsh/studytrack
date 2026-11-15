// Типы данных API (соответствуют схемам backend/app/schemas.py)

export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskType = "lab" | "practice" | "homework" | "coursework" | "exam" | "other";
export type Priority = "high" | "medium" | "low";
export type ControlType = "credit" | "graded_credit" | "exam";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  timezone: string;
  remind_days: number[];
  email_notifications: boolean;
  created_at: string;
}

export interface Semester {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_archived: boolean;
  course_count: number;
  task_count: number;
}

export interface Course {
  id: number;
  semester_id: number;
  title: string;
  teacher: string | null;
  control_type: ControlType;
  color: string;
  task_count: number;
}

export interface CourseBrief {
  id: number;
  title: string;
  color: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Subtask {
  id: number;
  title: string;
  is_done: boolean;
  position: number;
}

export interface Task {
  id: number;
  course_id: number;
  course: CourseBrief;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: Priority;
  due_at: string | null;
  estimate_hours: number | null;
  grade: number | null;
  position: number;
  is_overdue: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  tags: Tag[];
  subtasks_total: number;
  subtasks_done: number;
}

export interface TaskDetail extends Task {
  subtasks: Subtask[];
}

export interface TaskPage {
  items: Task[];
  total: number;
}

export interface Dashboard {
  semester: Semester | null;
  counters: Record<TaskStatus, number>;
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  progress: { course: CourseBrief; total: number; done: number; avg_grade: number | null }[];
}

export interface Notification {
  id: number;
  task_id: number;
  offset_days: number;
  channel: "in_app" | "email";
  message: string;
  created_at: string;
  is_read: boolean;
}

export interface TaskInput {
  course_id?: number;
  title?: string;
  description?: string | null;
  type?: TaskType;
  priority?: Priority;
  status?: TaskStatus;
  due_at?: string | null;
  estimate_hours?: number | null;
  grade?: number | null;
  tag_ids?: number[];
}
