import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { getHealth } from "./api/health";
import  { useAuth } from "./context/AuthContext";
import AppShell from "./components/dashboard/AppShell";
import AuthLayout from "./components/auth/AuthLayout";
import LoginPage from "./pages/LoginPage";
import { logout } from "./api/auth";
import CourseDetailPage from "./pages/CourseDetailPage";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import "./styles/dashboard.css";

type HealthState =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "error"; message: string };

function App() {
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
  // Increasing this number tells CourseList to fetch the latest courses.
  const [courseListVersion, setCourseListVersion] = useState(0);

  const { user, isRestoring, clearSession } = useAuth();

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
   setIsLoggingOut(true);
   setLogoutError(null);

  try {
    await logout();
    clearSession();
  } catch (error) {
    setLogoutError(
      error instanceof Error ? error.message : "Logout failed",
    );
  } finally {
    setIsLoggingOut(false);
  }
}


  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then((data) => {
        if (cancelled) {
          return;
        }

        setHealth(
          data.status === "ok"
            ? { status: "ok" }
            : { status: "error", message: "Unexpected health response" },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Backend is unreachable";
        setHealth({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const healthMessage = (
    <p className={`health health-${health.status}`}>
      {health.status === "checking" && "Checking backend..."}
      {health.status === "ok" && "Backend connected."}
      {health.status === "error" && `Backend unavailable. ${health.message}`}
    </p>
  );

  // Keep the requested URL during login so a direct course link opens afterward.
  if (isRestoring) {
    return (
      <main className="auth-layout">
        <h1>StudyForge</h1>
        {healthMessage}
        <p>Checking your session...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthLayout
        heroTitle="Welcome back"
        heroText="Log in to your cozy study space and pick up where you left off."
        footer={healthMessage}
      >
        <LoginPage />
      </AuthLayout>
    );
  }

  return (
    <AppShell
      email={user.email}
      health={health}
      isLoggingOut={isLoggingOut}
      logoutError={logoutError}
      onLogout={handleLogout}
    >
      <Routes>
        <Route path="/" element={
          <DashboardPage
            refreshKey={courseListVersion}
            onCourseCreated={() => setCourseListVersion((version) => version + 1)}
          />
        } />
        <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="*" element={
          <section className="course-detail">
            <h2>Page not found</h2>
            <Link to="/">Return to my courses</Link>
          </section>
        } />
      </Routes>
    </AppShell>
  );
}

export default App;
