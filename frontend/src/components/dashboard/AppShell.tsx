import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { PublicUser } from "../../api/auth";
import BrandMark from "../shared/BrandMark";
import ProfileMenu from "./ProfileMenu";

type HealthState =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "error"; message: string };

export default function AppShell({
  user,
  health,
  isSigningOut,
  onSignOut,
  children,
}: {
  user: PublicUser;
  health: HealthState;
  isSigningOut: boolean;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const { pathname, hash } = useLocation();
  const onDashboard = pathname === "/";

  return (
    // Course routes need a viewport-sized shell for independently scrolling content and chat.
    <div className={`app-shell${pathname.startsWith("/courses/") ? " app-shell-course" : ""}`}>
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
          <Link className={navClass(pathname === "/calendar")} to="/calendar" aria-current={pathname === "/calendar" ? "page" : undefined}>
            <CalendarIcon /> Calendar
          </Link>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <h1>{pageTitle(pathname)}</h1>
          <div className="topbar-meta">
            <p className={`health health-${health.status}`}>
              {health.status === "checking" && "Checking backend..."}
              {health.status === "ok" && "Backend connected."}
              {health.status === "error" && `Backend unavailable. ${health.message}`}
            </p>
            <ProfileMenu user={user} isSigningOut={isSigningOut} onSignOut={onSignOut} />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/courses/")) return "Course";
  if (pathname === "/calendar") return "Calendar";
  return "Dashboard";
}

function navClass(isActive: boolean) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" />
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
