import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

type HealthState =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "error"; message: string };

export default function AppShell({
  email,
  health,
  isLoggingOut,
  logoutError,
  onLogout,
  children,
}: {
  email: string;
  health: HealthState;
  isLoggingOut: boolean;
  logoutError: string | null;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { pathname, hash } = useLocation();
  const initial = email.trim().charAt(0).toUpperCase() || "?";
  const onDashboard = pathname === "/";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <BrandMark />
          StudyForge
        </Link>
        <nav className="sidebar-nav" aria-label="Main">
          <Link to="/" className={navClass(onDashboard && hash !== "#courses" && hash !== "#tasks")} aria-current={onDashboard && hash !== "#courses" && hash !== "#tasks" ? "page" : undefined}>
            <HomeIcon /> Home
          </Link>
          <Link className={navClass(onDashboard && hash === "#courses")} to="/#courses" aria-current={onDashboard && hash === "#courses" ? "page" : undefined}>
            <CoursesIcon /> Courses
          </Link>
          <Link className={navClass(onDashboard && hash === "#tasks")} to="/#tasks" aria-current={onDashboard && hash === "#tasks" ? "page" : undefined}>
            <TasksIcon /> Tasks
          </Link>
        </nav>
        <button className="nav-link sidebar-logout" type="button" onClick={onLogout} disabled={isLoggingOut}>
          <LogoutIcon />
          {isLoggingOut ? "Logging out..." : "Log out"}
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <h1>{pathname.startsWith("/courses/") ? "Course" : "Dashboard"}</h1>
          <div className="topbar-meta">
            <p className={`health health-${health.status}`}>
              {health.status === "checking" && "Checking backend..."}
              {health.status === "ok" && "Backend connected."}
              {health.status === "error" && `Backend unavailable. ${health.message}`}
            </p>
            <p className="account-email">Signed in as {email}</p>
            <span className="avatar" aria-hidden="true">{initial}</span>
          </div>
        </header>
        {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
        {children}
      </main>
    </div>
  );
}

function navClass(isActive: boolean) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v12.5L12.5 16 7 19.5V7A2.5 2.5 0 0 1 6 4.5z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function CoursesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h9" />
      <path d="M4 7.2 5.2 8.4 7.4 6M4 12.2 5.2 13.4 7.4 11" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 6H6.5A1.5 1.5 0 0 0 5 7.5v9A1.5 1.5 0 0 0 6.5 18H10M10 12h9M16 8.5 19.5 12 16 15.5" />
    </svg>
  );
}
