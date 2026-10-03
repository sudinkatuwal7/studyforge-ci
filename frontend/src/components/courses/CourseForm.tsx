import { type SubmitEvent, useState } from "react";
import { createCourse } from "../../api/courses";
import { useAuth } from "../../context/AuthContext";

function CourseForm({ onCreated }: { onCreated: () => void }) {
  // Use the token saved by the shared authentication provider after login.
  const { accessToken } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    // Handle submission in React without reloading the browser page.
    event.preventDefault();
    // Ignore repeat submissions while the first request is still running.
    if (submitting) return;

    // Reject empty names, including names made up of only spaces.
    if (name.trim() === "") {
      setError("Course name is required.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      await createCourse(accessToken, {
        name: name.trim(),
        description,
      });
      // Clear the form only after saving succeeds, then ask App to refresh the list.
      setName("");
      setDescription("");
      onCreated();
    } catch (caught: unknown) {
      // Keep the typed values so the student can correct or retry the submission.
      const message =
        caught instanceof Error ? caught.message : "Could not create the course.";
      setError(message);
    } finally {
      // Allow another submission after either success or failure.
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create a course</h2>

      <label htmlFor="course-name">Course name</label>
      <input
        id="course-name"
        maxLength={200}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <label htmlFor="course-description">Description</label>
      <textarea
        id="course-description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />

      <button type="submit" disabled={submitting}>
        {submitting ? "Creating..." : "Create"}
      </button>

      {/* Error sits under the button and only renders when error is not empty. */}
      {error !== "" && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

export default CourseForm;
