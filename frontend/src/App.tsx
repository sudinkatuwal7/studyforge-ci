import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { getHealth } from "./api/health";
import  { useAuth } from "./context/AuthContext";
import CourseForm from "./components/courses/CourseForm";
import LoginPage from "./pages/LoginPage";
import CourseList from "./components/courses/CourseList";
import CourseDetailPage from "./pages/CourseDetailPage";

type HealthState =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "error"; message: string };

function App() {
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
  // Increasing this number tells CourseList to fetch the latest courses.
  const [courseListVersion, setCourseListVersion] = useState(0);

  // Wait for session restoration before deciding whether to show login or courses.
  const { user, isRestoring } = useAuth();

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

  return (
    <main>
      <h1>StudyForge</h1>
      <p className={`health health-${health.status}`}>
        {health.status === "checking" && "Checking backend..."}
        {health.status === "ok" && "Backend connected."}
        {health.status === "error" && `Backend unavailable. ${health.message}`}
      </p>
    
      {/* Keep the requested URL during login so a direct course link opens afterward. */}
      {isRestoring ? (
        <p>Checking your session...</p>
      ) : user ? (
        <>
          <p>Signed in as {user.email}</p>
          {/* Signed-in users get a dashboard at / and a detail page for each course. */}
          <Routes>
            <Route path="/" element={
              <div className="dashboard">
                <CourseList refreshKey={courseListVersion} />
                {/* A successful save triggers the list refresh through this callback. */}
                <CourseForm onCreated={() => setCourseListVersion((version) => version + 1)} />
              </div>
            } />
            <Route path="/courses/:courseId" element={<CourseDetailPage />} />
            <Route path="*" element={
              <section className="course-detail">
                <h2>Page not found</h2>
                <Link to="/">Return to my courses</Link>
              </section>
            } />
          </Routes>
        </>
      ) : (
        <>
          <LoginPage />
          <CourseList refreshKey={courseListVersion} />
        </>
      )}
    </main>
  );
}

export default App;
