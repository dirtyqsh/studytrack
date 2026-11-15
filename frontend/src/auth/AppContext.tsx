// Глобальное состояние: пользователь, семестры, дисциплины, метки, модальное окно задачи, уведомления-тосты.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setUnauthorizedHandler, tokens } from "../api/client";
import { authApi, coursesApi, semestersApi, tagsApi, usersApi } from "../api/endpoints";
import type { Course, Semester, Tag, TaskInput, User } from "../api/types";

type ToastKind = "info" | "error" | "success";
interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

interface TaskModalState {
  taskId: number | null;
  defaults?: TaskInput;
}

interface AppState {
  ready: boolean;
  user: User | null;
  setUser: (user: User) => void;
  signIn: (pair: { access_token: string; refresh_token: string; token_type: string; expires_in: number }) => Promise<void>;
  signOut: () => Promise<void>;

  semesters: Semester[];
  semester: Semester | null; // семестр, который сейчас просматривается
  readOnly: boolean; // архивный семестр доступен только для чтения
  selectSemester: (id: number) => Promise<void>;
  courses: Course[];
  tags: Tag[];
  reloadMeta: () => Promise<void>;

  version: number; // увеличивается после любого изменения задач — страницы перезагружают данные
  bump: () => void;

  modal: TaskModalState | null;
  openTask: (taskId: number) => void;
  newTask: (defaults?: TaskInput) => void;
  closeTask: () => void;

  toasts: Toast[];
  notify: (text: string, kind?: ToastKind) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [viewedId, setViewedId] = useState<number | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [version, setVersion] = useState(0);
  const [modal, setModal] = useState<TaskModalState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((text: string, kind: ToastKind = "info") => {
    const id = ++toastId.current;
    setToasts((list) => [...list, { id, text, kind }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4500);
  }, []);

  const resetSession = useCallback(() => {
    setUser(null);
    setSemesters([]);
    setCourses([]);
    setTags([]);
    setViewedId(null);
    setModal(null);
  }, []);

  const semester = useMemo(() => {
    const viewed = semesters.find((s) => s.id === viewedId);
    return viewed ?? semesters.find((s) => s.is_current) ?? null;
  }, [semesters, viewedId]);

  const reloadMeta = useCallback(async () => {
    const [list, tagList] = await Promise.all([semestersApi.list(), tagsApi.list()]);
    setSemesters(list);
    setTags(tagList);
  }, []);

  // После изменений задач обновляем счётчики семестров (сайдбар, список семестров)
  useEffect(() => {
    if (version > 0) reloadMeta().catch(() => undefined);
  }, [version, reloadMeta]);

  // Дисциплины просматриваемого семестра
  useEffect(() => {
    if (!semester) {
      setCourses([]);
      return;
    }
    coursesApi
      .list(semester.id)
      .then(setCourses)
      .catch(() => setCourses([]));
  }, [semester, version]);

  const loadUser = useCallback(async () => {
    const me = await usersApi.me();
    setUser(me);
    await reloadMeta();
  }, [reloadMeta]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      resetSession();
    });
    if (!tokens.access) {
      setReady(true);
      return;
    }
    loadUser()
      .catch(() => tokens.clear())
      .finally(() => setReady(true));
  }, [loadUser, resetSession]);

  const signIn: AppState["signIn"] = useCallback(
    async (pair) => {
      tokens.save(pair);
      await loadUser();
    },
    [loadUser],
  );

  const signOut = useCallback(async () => {
    const refresh = tokens.refresh;
    tokens.clear();
    resetSession();
    if (refresh) await authApi.logout(refresh).catch(() => undefined);
  }, [resetSession]);

  const selectSemester = useCallback(
    async (id: number) => {
      const target = semesters.find((s) => s.id === id);
      if (!target) return;
      if (!target.is_archived && !target.is_current) {
        // ФТ-06: выбор текущего семестра
        await semestersApi.update(id, { is_current: true });
        await reloadMeta();
        setViewedId(null);
      } else {
        setViewedId(target.is_current ? null : id);
      }
      setVersion((v) => v + 1);
    },
    [semesters, reloadMeta],
  );

  const value: AppState = {
    ready,
    user,
    setUser,
    signIn,
    signOut,
    semesters,
    semester,
    readOnly: semester?.is_archived ?? false,
    selectSemester,
    courses,
    tags,
    reloadMeta,
    version,
    bump: () => setVersion((v) => v + 1),
    modal,
    openTask: (taskId) => setModal({ taskId }),
    newTask: (defaults) => setModal({ taskId: null, defaults }),
    closeTask: () => setModal(null),
    toasts,
    notify,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp вне AppProvider");
  return ctx;
}

/** Часовой пояс текущего пользователя (по умолчанию — пояс браузера). */
export function useTimeZone(): string {
  const { user } = useApp();
  return user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
