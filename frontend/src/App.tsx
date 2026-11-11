import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { getHealth } from "./api/health";
import { useAuth } from "./context/AuthContext";
import AppShell from "./components/dashboard/AppShell";
import AuthLayout from "./components/auth/AuthLayout";
import { useSignInLock } from "./components/auth/useSignInLock";
import LandingPage from "./pages/LandingPage";
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

  const { user, isRestoring, isSigningOut, signedOutReason, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Lives here so a request started on one card still blocks the other card.
  const signInLock = useSignInLock();

  // The new account's email, when sign-up worked but its automatic login did not.
  const [createdEmail, setCreatedEmail] = useState("");

  // Show the signed-out notice at the root only on the navigation where the
  // session ended. A later navigation can show the public landing page again.
  const [previousUser, setPreviousUser] = useState(user);
  const [sessionEndedAt, setSessionEndedAt] = useState<string | null>(null);
  if (user !== previousUser) {
    setPreviousUser(user);
    setSessionEndedAt(user ? null : location.key);
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
    const loginCard = (
      <AuthLayout
        heroTitle="Welcome back"
        heroText="Log in to your cozy study space and pick up where you left off."
        footer={healthMessage}
      >
        <LoginPage
          initialEmail={createdEmail}
          onCreateAccount={() => navigate("/register")}
          signInLock={signInLock}
        />
      </AuthLayout>
    );
    const showNoticeAtRoot = signedOutReason !== null && sessionEndedAt === location.key;

    return (
      <Routes>
        <Route path="/" element={showNoticeAtRoot ? loginCard : <LandingPage footer={healthMessage} />} />
        <Route path="/login" element={loginCard} />
        <Route path="/register" element={
          <AuthLayout
            heroTitle="Start studying smarter"
            heroText="Create a free account to keep your courses, materials, and study sessions in one place."
            footer={healthMessage}
          >
            <RegisterPage
              onSignIn={() => navigate("/login")}
              onAccountCreated={setCreatedEmail}
              signInLock={signInLock}
            />
          </AuthLayout>
        } />
        <Route path="*" element={loginCard} />
      </Routes>
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
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
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
