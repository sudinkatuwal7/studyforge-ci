import { useState, type SubmitEvent } from "react";
import { useAuth } from "../context/AuthContext";
import DocumentUpload from "../components/documents/DocumentUpload";
import LoginPage from "./LoginPage";
import "../styles/index.css";

export default function DocumentUploadPreview() {
  const { user, isRestoring } = useAuth();
  const initialCourse = new URLSearchParams(window.location.search).get("courseId") ?? "";
  const [courseInput, setCourseInput] = useState(initialCourse);
  const [courseId, setCourseId] = useState<number | null>(() => {
    const id = Number(initialCourse);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  });
  const [courseError, setCourseError] = useState("");

  function selectCourse(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = Number(courseInput);
    if (!Number.isSafeInteger(id) || id <= 0) {
      setCourseError("Enter a valid course ID greater than zero.");
      return;
    }
    setCourseError("");
    setCourseId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("courseId", String(id));
    window.history.replaceState(null, "", url);
  }

  return (
    <main>
      <h1>PDF upload development preview</h1>
      <p>This separate preview is for testing before the course screen is integrated.</p>
      {isRestoring ? <p role="status">Checking your session…</p> : !user ? <LoginPage /> : <>
        <p>Signed in as {user.email}</p>
        <form onSubmit={selectCourse} aria-label="Choose test course">
          <label htmlFor="preview-course-id">Course ID</label>
          <input id="preview-course-id" type="number" min="1" step="1" required
            value={courseInput} onChange={(event) => setCourseInput(event.target.value)}
            aria-describedby="preview-course-hint" />
          <p id="preview-course-hint">Enter the ID of a test course owned by your account.</p>
          <button type="submit">Open upload form</button>
          {courseError && <p role="alert">{courseError}</p>}
        </form>
        {courseId !== null && <>
          <p>Test course: {courseId}</p>
          <DocumentUpload courseId={courseId} />
        </>}
      </>}
    </main>
  );
}
