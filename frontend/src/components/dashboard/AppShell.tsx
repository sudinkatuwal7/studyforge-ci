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
  const { pathname, hash, key } = useLocation();
  const onDashboard = pathname === "/";
  const onHome = onDashboard && hash !== "#courses" && hash !== "#tasks";

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
          <Link to="/" className={navClass(onHome)} aria-current={onHome ? "page" : undefined}>
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
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
