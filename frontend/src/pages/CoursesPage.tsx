// UC-03, UC-04: семестры, дисциплины и метки (ФТ-06…ФТ-08, ФТ-13)

import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { coursesApi, semestersApi, tagsApi, type CourseInput, type SemesterInput } from "../api/endpoints";
import type { ControlType, Course, Semester, Tag } from "../api/types";
import { useApp } from "../auth/AppContext";
import { IconPlus, IconTrash } from "../components/Icons";
import { ConfirmDialog, Modal } from "../components/Modal";
import { CONTROL_TITLE, COURSE_COLORS, plural } from "../lib/labels";

type FieldErrors = Record<string, string>;

function collectErrors(err: unknown): FieldErrors {
  const e = err as ApiError;
  const result: FieldErrors = {};
  e.details?.forEach((d) => (result[d.field] = d.message));
  if (!Object.keys(result).length) result._ = e.message;
  return result;
}

const formatDay = (iso: string) => iso.split("-").reverse().join(".");

function SemesterForm({ initial, onClose }: { initial: Semester | null; onClose: () => void }) {
  const { reloadMeta, bump, notify } = useApp();
  const [form, setForm] = useState<SemesterInput>({
    title: initial?.title ?? "",
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const local: FieldErrors = {};
    if (!form.title?.trim()) local.title = "Укажите название";
    if (!form.start_date) local.start_date = "Укажите дату начала";
    if (!form.end_date) local.end_date = "Укажите дату окончания";
    if (form.start_date && form.end_date && form.start_date > form.end_date)
      local.end_date = "Окончание раньше начала";
    setErrors(local);
    if (Object.keys(local).length) return;
    try {
      if (initial) await semestersApi.update(initial.id, { ...form, title: form.title!.trim() });
      else await semestersApi.create({ ...form, title: form.title!.trim() });
      await reloadMeta();
      bump();
      notify(initial ? "Семестр сохранён" : "Семестр создан", "success");
      onClose();
    } catch (err) {
      setErrors(collectErrors(err));
    }
  };

  return (
    <Modal
      title={initial ? "Редактировать семестр" : "Новый семестр"}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" form="semester-form" className="btn btn-primary">
            Сохранить
          </button>
        </>
      }
    >
      <form id="semester-form" className="stack" onSubmit={submit} noValidate>
        {errors._ && <p className="error-text">{errors._}</p>}
        <div className="field">
          <label className="label" htmlFor="sem-title">
            Название
          </label>
          <input
            id="sem-title"
            className={`input${errors.title ? " invalid" : ""}`}
            placeholder="Например, Осень 2026"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
          {errors.title && <span className="error-text">{errors.title}</span>}
        </div>
        <div className="two-cols">
          <div className="field">
            <label className="label" htmlFor="sem-start">
              Начало
            </label>
            <input
              id="sem-start"
              type="date"
              className={`input${errors.start_date ? " invalid" : ""}`}
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
            {errors.start_date && <span className="error-text">{errors.start_date}</span>}
          </div>
          <div className="field">
            <label className="label" htmlFor="sem-end">
              Окончание
            </label>
            <input
              id="sem-end"
              type="date"
              className={`input${errors.end_date ? " invalid" : ""}`}
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
            {errors.end_date && <span className="error-text">{errors.end_date}</span>}
          </div>
        </div>
      </form>
    </Modal>
  );
}

function CourseForm({
  semesterId,
  initial,
  usedColors,
  onClose,
}: {
  semesterId: number;
  initial: Course | null;
  usedColors: string[];
  onClose: () => void;
}) {
  const { bump, notify } = useApp();
  const [form, setForm] = useState<CourseInput>({
    title: initial?.title ?? "",
    teacher: initial?.teacher ?? "",
    control_type: initial?.control_type ?? "exam",
    color: initial?.color ?? COURSE_COLORS.find((c) => !usedColors.includes(c)) ?? COURSE_COLORS[0],
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title?.trim()) {
      setErrors({ title: "Укажите название дисциплины" });
      return;
    }
    const body = { ...form, title: form.title.trim(), teacher: form.teacher?.trim() || null };
    try {
      if (initial) await coursesApi.update(initial.id, body);
      else await coursesApi.create(semesterId, body);
      bump();
      notify(initial ? "Дисциплина сохранена" : "Дисциплина добавлена", "success");
      onClose();
    } catch (err) {
      setErrors(collectErrors(err));
    }
  };

  return (
    <Modal
      title={initial ? "Редактировать дисциплину" : "Новая дисциплина"}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" form="course-form" className="btn btn-primary">
            Сохранить
          </button>
        </>
      }
    >
      <form id="course-form" className="stack" onSubmit={submit} noValidate>
        {errors._ && <p className="error-text">{errors._}</p>}
        <div className="field">
          <label className="label" htmlFor="course-title">
            Название
          </label>
          <input
            id="course-title"
            className={`input${errors.title ? " invalid" : ""}`}
            placeholder="Например, Базы данных"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
          />
          {errors.title && <span className="error-text">{errors.title}</span>}
        </div>
        <div className="field">
          <label className="label" htmlFor="course-teacher">
            Преподаватель
          </label>
          <input
            id="course-teacher"
            className="input"
            placeholder="Необязательно"
            value={form.teacher ?? ""}
            onChange={(e) => setForm({ ...form, teacher: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="course-control">
            Форма контроля
          </label>
          <select
            id="course-control"
            className="input"
            value={form.control_type}
            onChange={(e) => setForm({ ...form, control_type: e.target.value as ControlType })}
          >
            {Object.entries(CONTROL_TITLE).map(([key, title]) => (
              <option key={key} value={key}>
                {title}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="field">
          <legend className="label">Цвет</legend>
          <div className="swatches">
            {COURSE_COLORS.map((color) => (
              <button
                type="button"
                key={color}
                className={`swatch${form.color === color ? " active" : ""}`}
                style={{ background: color }}
                aria-label={`Цвет ${color}`}
                aria-pressed={form.color === color}
                onClick={() => setForm({ ...form, color })}
              />
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

function TagsPanel() {
  const { tags, reloadMeta, bump, notify } = useApp();
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<Tag | null>(null);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await tagsApi.create(name.trim());
      setName("");
      await reloadMeta();
    } catch (err) {
      notify((err as ApiError).message, "error");
    }
  };

  return (
    <section className="panel">
      <h2 className="panel-title">Метки</h2>
      <p className="muted small">Метки общие для всех семестров, например «отчёт» или «защита».</p>
      <div className="tag-list">
        {tags.map((tag) => (
          <span key={tag.id} className="badge badge-tag tag-removable">
            #{tag.name}
            <button type="button" aria-label={`Удалить метку ${tag.name}`} onClick={() => setToDelete(tag)}>
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="muted small">Меток пока нет.</span>}
      </div>
      <form className="inline-add" onSubmit={add}>
        <label htmlFor="tags-panel-new" className="sr-only">
          Новая метка
        </label>
        <input
          id="tags-panel-new"
          className="input input-sm"
          placeholder="Новая метка"
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn-ghost btn-sm">
          Добавить
        </button>
      </form>
      {toDelete && (
        <ConfirmDialog
          title="Удалить метку?"
          text={`Метка «${toDelete.name}» будет снята со всех задач.`}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await tagsApi.remove(toDelete.id).catch((err: ApiError) => notify(err.message, "error"));
            setToDelete(null);
            await reloadMeta();
            bump();
          }}
        />
      )}
    </section>
  );
}

export function CoursesPage() {
  const { semesters, semester, courses, readOnly, selectSemester, reloadMeta, bump, notify } = useApp();
  const [semesterForm, setSemesterForm] = useState<Semester | null | "new">(null);
  const [courseForm, setCourseForm] = useState<Course | null | "new">(null);
  const [confirm, setConfirm] = useState<
    | { kind: "semester"; item: Semester }
    | { kind: "archive"; item: Semester }
    | { kind: "course"; item: Course; force: boolean }
    | null
  >(null);

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      await reloadMeta();
      bump();
      notify(message, "success");
    } catch (err) {
      notify((err as ApiError).message, "error");
    }
  };

  const removeCourse = async (course: Course, force: boolean) => {
    try {
      await coursesApi.remove(course.id, force);
      bump();
      await reloadMeta();
      notify("Дисциплина удалена", "success");
      setConfirm(null);
    } catch (err) {
      const e = err as ApiError;
      // ФТ-08: у дисциплины есть задачи — сервер требует подтверждения
      if (e.code === "course_has_tasks") setConfirm({ kind: "course", item: course, force: true });
      else {
        notify(e.message, "error");
        setConfirm(null);
      }
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <p className="muted">Семестры, дисциплины и метки</p>
          <h1>Дисциплины</h1>
        </div>
      </div>

      <div className="courses-grid">
        <section className="panel">
          <div className="row-between">
            <h2 className="panel-title">Семестры</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSemesterForm("new")}>
              <IconPlus size={16} /> Семестр
            </button>
          </div>
          {semesters.length === 0 && (
            <div className="onboarding">
              <p className="strong">Начните с семестра</p>
              <p className="muted small">Укажите его название и даты, затем добавьте дисциплины.</p>
              <button type="button" className="btn btn-primary" onClick={() => setSemesterForm("new")}>
                Создать семестр
              </button>
            </div>
          )}
          <ul className="semester-list">
            {semesters.map((s) => (
              <li key={s.id} className={`semester-item${semester?.id === s.id ? " selected" : ""}`}>
                <button type="button" className="semester-main" onClick={() => selectSemester(s.id)}>
                  <span className="strong">{s.title}</span>
                  <span className="muted small">
                    {formatDay(s.start_date)} — {formatDay(s.end_date)} · {s.course_count}{" "}
                    {plural(s.course_count, "дисциплина", "дисциплины", "дисциплин")}, {s.task_count}{" "}
                    {plural(s.task_count, "задача", "задачи", "задач")}
                  </span>
                </button>
                <div className="semester-actions">
                  {s.is_current && <span className="badge badge-current">текущий</span>}
                  {s.is_archived && <span className="badge">архив</span>}
                  {!s.is_archived && (
                    <button type="button" className="btn btn-text btn-sm" onClick={() => setSemesterForm(s)}>
                      Изменить
                    </button>
                  )}
                  {s.is_archived ? (
                    <button
                      type="button"
                      className="btn btn-text btn-sm"
                      onClick={() => run(() => semestersApi.update(s.id, { is_archived: false }), "Семестр возвращён из архива")}
                    >
                      Из архива
                    </button>
                  ) : (
                    <button type="button" className="btn btn-text btn-sm" onClick={() => setConfirm({ kind: "archive", item: s })}>
                      В архив
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn small"
                    aria-label={`Удалить семестр ${s.title}`}
                    onClick={() => setConfirm({ kind: "semester", item: s })}
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="row-between">
            <h2 className="panel-title">
              Дисциплины{semester ? ` · ${semester.title}` : ""}
            </h2>
            {semester && !readOnly && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setCourseForm("new")}>
                <IconPlus size={16} /> Дисциплина
              </button>
            )}
          </div>
          {!semester && <p className="muted">Сначала создайте семестр.</p>}
          {semester && courses.length === 0 && (
            <p className="muted">
              В семестре пока нет дисциплин. Добавьте первую — и можно заводить задачи.
            </p>
          )}
          <div className="course-cards">
            {courses.map((c) => (
              <article key={c.id} className="course-card" style={{ borderTopColor: c.color }}>
                <div className="course-card-head">
                  <h3>{c.title}</h3>
                  {!readOnly && (
                    <div className="course-actions">
                      <button type="button" className="btn btn-text btn-sm" onClick={() => setCourseForm(c)}>
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="icon-btn small"
                        aria-label={`Удалить дисциплину ${c.title}`}
                        onClick={() => setConfirm({ kind: "course", item: c, force: false })}
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  )}
                </div>
                <p className="muted small">{c.teacher || "Преподаватель не указан"}</p>
                <div className="row-between small">
                  <span className="badge">{CONTROL_TITLE[c.control_type]}</span>
                  <span className="muted">
                    {c.task_count} {plural(c.task_count, "задача", "задачи", "задач")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <TagsPanel />
      </div>

      {semesterForm && (
        <SemesterForm initial={semesterForm === "new" ? null : semesterForm} onClose={() => setSemesterForm(null)} />
      )}
      {courseForm && semester && (
        <CourseForm
          semesterId={semester.id}
          initial={courseForm === "new" ? null : courseForm}
          usedColors={courses.map((c) => c.color)}
          onClose={() => setCourseForm(null)}
        />
      )}
      {confirm?.kind === "semester" && (
        <ConfirmDialog
          title="Удалить семестр?"
          text={`Семестр «${confirm.item.title}» будет удалён вместе со всеми дисциплинами и задачами (${confirm.item.task_count}). Действие необратимо.`}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.item.id;
            setConfirm(null);
            run(() => semestersApi.remove(id), "Семестр удалён");
          }}
        />
      )}
      {confirm?.kind === "archive" && (
        <ConfirmDialog
          title="Перенести семестр в архив?"
          text="Архивный семестр доступен только для просмотра, напоминания по его задачам не отправляются."
          confirmText="В архив"
          danger={false}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.item.id;
            setConfirm(null);
            run(() => semestersApi.update(id, { is_archived: true }), "Семестр перенесён в архив");
          }}
        />
      )}
      {confirm?.kind === "course" && (
        <ConfirmDialog
          title="Удалить дисциплину?"
          text={
            confirm.force
              ? `У дисциплины «${confirm.item.title}» есть задачи (${confirm.item.task_count}). Они будут удалены вместе с ней.`
              : `Дисциплина «${confirm.item.title}» будет удалена.`
          }
          confirmText={confirm.force ? "Удалить вместе с задачами" : "Удалить"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => removeCourse(confirm.item, confirm.force)}
        />
      )}
    </div>
  );
}
