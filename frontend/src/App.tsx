import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { getHealth } from "./api/health";
import { useAuth } from "./context/AuthContext";
import AppShell from "./components/dashboard/AppShell";
import AuthLayout from "./components/auth/AuthLayout";
import { useSignInLock } from "./components/auth/useSignInLock";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
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

  const { user, isRestoring, isSigningOut, signOut } = useAuth();

  // Which card the signed-out page shows.
  const [authView, setAuthView] = useState<"login" | "register">("login");
  // Lives here so a request started on one card still blocks the other card.
  const signInLock = useSignInLock();

  // The new account's email, when sign-up worked but its automatic login did not.
  const [createdEmail, setCreatedEmail] = useState("");

  // Reset to the log in card while signed in, so whenever the session ends the
  // user lands where the signed-out message is shown.
  if (user && authView !== "login") {
    setAuthView("login");
  }
  // Forget it once signed in, so the next person on this computer does not see it.
  if (user && createdEmail) {
    setCreatedEmail("");
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
    const isRegister = authView === "register";

    return (
      <AuthLayout
        heroTitle={isRegister ? "Start studying smarter" : "Welcome back"}
        heroText={
          isRegister
            ? "Create a free account to keep your courses, materials, and study sessions in one place."
            : "Log in to your cozy study space and pick up where you left off."
        }
        headerActions={
          <>
            <button
              type="button"
              className="auth-pill"
              aria-current={isRegister ? undefined : "page"}
              onClick={() => setAuthView("login")}
            >
              Log in
            </button>
            <button
              type="button"
              className="auth-pill auth-pill-dark"
              aria-current={isRegister ? "page" : undefined}
              onClick={() => setAuthView("register")}
            >
              Start free
            </button>
          </>
        }
        footer={healthMessage}
      >
        {isRegister ? (
          <RegisterPage
            onSignIn={() => setAuthView("login")}
            onAccountCreated={setCreatedEmail}
            signInLock={signInLock}
          />
        ) : (
          <LoginPage
            initialEmail={createdEmail}
            onCreateAccount={() => setAuthView("register")}
            signInLock={signInLock}
          />
        )}
      </AuthLayout>
    );
  }

  return (
    <AppShell
      user={user}
      health={health}
      isSigningOut={isSigningOut}
      onSignOut={() => void signOut()}
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
