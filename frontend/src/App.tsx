import { useEffect, useState } from "react";
import { getHealth } from "./api/health";
import  { useAuth } from "./context/AuthContext";
import CourseForm from "./components/courses/CourseForm";
import LoginPage from "./pages/LoginPage";
import CourseList from "./components/courses/CourseList";

type HealthState =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "error"; message: string };

function App() {
  const [health, setHealth] = useState<HealthState>({ status: "checking" });

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
      <p>Development environment running.</p>
      <p className={`health health-${health.status}`}>
        {health.status === "checking" && "Checking backend..."}
        {health.status === "ok" && "Backend connected."}
        {health.status === "error" && `Backend unavailable. ${health.message}`}
      </p>
    
       {isRestoring ? (
         <p>Checking your session...</p>
       ) : user ? (
        <>
          <p>Signed in as {user.email}</p>
          <CourseList />
          <CourseForm />
        </>
       ) : (
         <LoginPage />
  
     )}
    </main>
  );
}

export default App;
