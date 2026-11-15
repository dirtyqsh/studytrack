// UC-01, UC-02, ФТ-05: вход, регистрация, восстановление пароля

import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { authApi } from "../api/endpoints";
import { useApp } from "../auth/AppContext";
import { IconCheck, IconLogo } from "../components/Icons";

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-promo">
        <div className="brand brand-light">
          <IconLogo size={40} />
          <span>StudyTrack</span>
        </div>
        <div className="auth-promo-body">
          <h1>Все учебные задачи семестра — на одной доске</h1>
          <p>Лабораторные, практики и курсовые по дисциплинам, сроки и оценки — в личном трекере студента.</p>
          <ul>
            <li>
              <IconCheck /> Семестры и дисциплины вместо безликих списков
            </li>
            <li>
              <IconCheck /> Статус «На проверке» и учёт полученных оценок
            </li>
            <li>
              <IconCheck /> Напоминания о сроках
            </li>
          </ul>
        </div>
        <p className="auth-foot">Учебный проект · Основы разработки коммерческого ПО</p>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-card">{children}</div>
      </section>
    </div>
  );
}

export function LoginPage() {
  const { signIn } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!isLogin && password.length < 8) {
      setError("Пароль должен быть не короче 8 символов");
      return;
    }
    setBusy(true);
    try {
      const pair = isLogin
        ? await authApi.login({ email, password })
        : await authApi.register({ email, password, name: name.trim() });
      await signIn(pair);
      navigate(isLogin ? "/" : "/courses", { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="segmented" role="group" aria-label="Режим">
        <button type="button" className={isLogin ? "active" : ""} aria-pressed={isLogin} onClick={() => setMode("login")}>
          Вход
        </button>
        <button
          type="button"
          className={!isLogin ? "active" : ""}
          aria-pressed={!isLogin}
          onClick={() => setMode("register")}
        >
          Регистрация
        </button>
      </div>
      <div>
        <h2 className="auth-title">{isLogin ? "С возвращением" : "Создайте аккаунт"}</h2>
        <p className="muted">
          {isLogin ? "Войдите, чтобы открыть свою доску задач." : "Аккаунт бесплатный: только e-mail и пароль."}
        </p>
      </div>
      <form className="stack" onSubmit={submit}>
        {!isLogin && (
          <div className="field">
            <label htmlFor="name">Имя</label>
            <input id="name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            className="input"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            type="password"
            className="input"
            required
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {!isLogin && <span className="muted small">Не короче 8 символов</span>}
        </div>
        {isLogin && (
          <Link to="/forgot-password" className="small right">
            Забыли пароль?
          </Link>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? "Подождите…" : isLogin ? "Войти" : "Зарегистрироваться"}
        </button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await authApi.requestReset(email);
      setSent(true);
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  return (
    <AuthShell>
      <h2 className="auth-title">Восстановление пароля</h2>
      {sent ? (
        <p>Если такой e-mail зарегистрирован, мы отправили на него ссылку для смены пароля. Она действует 1 час.</p>
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label htmlFor="reset-email">E-mail</label>
            <input
              id="reset-email"
              type="email"
              className="input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg">
            Отправить ссылку
          </button>
        </form>
      )}
      <Link to="/login" className="small">
        ← Вернуться ко входу
      </Link>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Пароль должен быть не короче 8 символов");
      return;
    }
    try {
      await authApi.confirmReset(params.get("token") ?? "", password);
      navigate("/login", { replace: true });
    } catch (err) {
      setError((err as ApiError).message);
    }
  };

  return (
    <AuthShell>
      <h2 className="auth-title">Новый пароль</h2>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="new-password">Новый пароль</label>
          <input
            id="new-password"
            type="password"
            className="input"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg">
          Сохранить пароль
        </button>
      </form>
    </AuthShell>
  );
}
