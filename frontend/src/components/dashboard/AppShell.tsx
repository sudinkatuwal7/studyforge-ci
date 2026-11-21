import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
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
  const { pathname, key } = useLocation();
  const onDashboard = pathname === "/";
  // Courses stays highlighted inside a course (/courses/7/notes), since that is where it leads.
  const onCourses = pathname === "/courses" || pathname.startsWith("/courses/");
  // Notes stays highlighted on a single note (/notes/5), which is opened from the library.
  const onNotes = pathname === "/notes" || pathname.startsWith("/notes/");
  const onTasks = pathname === "/tasks";
  const onQuizHistory = pathname === "/quiz-history";
  const onCalendar = pathname === "/calendar";

  // On phones the sidebar is a drawer. It stays open only for the location it
  // was opened on, so any navigation (a nav link, Back, a course link) closes it.
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null);
  // Forget that location once we leave it, so going Back to it doesn't reopen the drawer.
  if (navOpenAt !== null && navOpenAt !== key) setNavOpenAt(null);
  const navOpen = navOpenAt === key;

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const wasNavOpen = useRef(false);
  // Desktop keeps the focused drawer link visible in the sidebar.
  const returnFocusOnClose = useRef(true);

  useEffect(() => {
    if (navOpen) {
      returnFocusOnClose.current = true;
      brandRef.current?.focus();
    } else if (wasNavOpen.current && returnFocusOnClose.current) {
      menuButtonRef.current?.focus();
    }
    wasNavOpen.current = navOpen;
  }, [navOpen]);

  useEffect(() => {
    const desktop = window.matchMedia?.("(min-width: 64.0625rem)");
    if (!desktop) return;
    const close = () => {
      if (!desktop.matches) return;
      returnFocusOnClose.current = false;
      setNavOpenAt(null);
    };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  function closeNav() {
    setNavOpenAt(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!navOpen) return;
    if (event.key === "Escape") closeNav();
    if (event.key === "Tab") {
      const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>(".sidebar a"));
      const first = links[0];
      const last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  return (
    <div className={shellClass(pathname, navOpen)} onKeyDown={handleKeyDown}>
      <aside id="app-sidebar" className="sidebar" role={navOpen ? "dialog" : undefined} aria-modal={navOpen ? "true" : undefined} aria-label={navOpen ? "Navigation" : undefined}>
        <Link to="/" className="brand" ref={brandRef}>
          <BrandMark />
          StudyForge
        </Link>
        <nav className="sidebar-nav" aria-label="Main">
          <Link to="/" className={navClass(onDashboard)} aria-current={onDashboard ? "page" : undefined}>
            <HomeIcon /> Dashboard
          </Link>
          <Link to="/courses" className={navClass(onCourses)} aria-current={onCourses ? "page" : undefined}>
            <CoursesIcon /> Courses
          </Link>
          <Link to="/notes" className={navClass(onNotes)} aria-current={onNotes ? "page" : undefined}>
            <NotesIcon /> Notes
          </Link>
          <Link to="/tasks" className={navClass(onTasks)} aria-current={onTasks ? "page" : undefined}>
            <TasksIcon /> Tasks
          </Link>
          <Link to="/quiz-history" className={navClass(onQuizHistory)} aria-current={onQuizHistory ? "page" : undefined}>
            <QuizHistoryIcon /> Quiz History
          </Link>
          <Link to="/calendar" className={navClass(onCalendar)} aria-current={onCalendar ? "page" : undefined}>
            <CalendarIcon /> Calendar
          </Link>
        </nav>
      </aside>

      <main className="workspace" inert={navOpen}>
        <header className="topbar">
          {/* Only shown on phones, where the sidebar becomes a drawer. */}
          <button
            ref={menuButtonRef}
            type="button"
            className="nav-toggle"
            aria-label="Navigation menu"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            onClick={() => setNavOpenAt(navOpen ? null : key)}
          >
            <MenuIcon />
          </button>
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

      {/* Tapping outside the open drawer closes it. Placed last so it never takes a desktop grid cell. */}
      <div className="sidebar-backdrop" aria-hidden="true" onClick={closeNav} />
    </div>
  );
}

function shellClass(pathname: string, navOpen: boolean) {
  let name = "app-shell";
  // Course routes need a viewport-sized shell for independently scrolling content and chat.
  if (pathname.startsWith("/courses/")) name += " app-shell-course";
  if (navOpen) name += " app-shell-nav-open";
  return name;
}

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/courses/")) return "Course";
  if (pathname === "/courses") return "My Courses";
  if (pathname.startsWith("/notes/")) return "Notes";
  if (pathname === "/notes") return "My Notes";
  if (pathname === "/tasks") return "Tasks";
  if (pathname === "/quiz-history") return "Quiz History";
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

function NotesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20z" />
      <path d="M15 3.5V8h4M9 12h7M9 16h5" />
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

function QuizHistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16l3.5-4 3 2.5L19 8" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
