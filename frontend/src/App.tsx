// Маршруты приложения: публичные страницы входа и защищённая часть с общим макетом

import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { useApp } from "./auth/AppContext";
import { Layout } from "./components/Layout";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from "./pages/AuthPages";
import { BoardPage } from "./pages/BoardPage";
import { CalendarPage } from "./pages/CalendarPage";
import { CoursesPage } from "./pages/CoursesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ListPage } from "./pages/ListPage";
import { ProfilePage } from "./pages/ProfilePage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, user } = useApp();
  const location = useLocation();
  if (!ready) return <div className="loading loading-full">Загрузка…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { ready, user } = useApp();
  if (!ready) return <div className="loading loading-full">Загрузка…</div>;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<DashboardPage />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="tasks" element={<ListPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
