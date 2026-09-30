import { useEffect, useState } from "react";
import { getHealth } from "./api/health";
import CourseForm from "./components/courses/CourseForm";

type HealthState =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "error"; message: string };

function App() {
  const [health, setHealth] = useState<HealthState>({ status: "checking" });

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
      <CourseForm />
    </main>
  );
}

export default App;
