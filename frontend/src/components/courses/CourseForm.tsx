import { type SubmitEvent, useState } from "react";

function CourseForm() {
  // Text the student types into the name box. Required.
  const [name, setName] = useState("");
  // Text the student types into the description box. Optional.
  const [description, setDescription] = useState("");
  // Empty until Create is clicked with a blank name.
  const [error, setError] = useState("");

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    // Keep the page from reloading when the form is submitted.
    event.preventDefault();

    // trim() removes spaces, so a name of only spaces still fails.
    if (name.trim() === "") {
      setError("Course name is required.");
      return;
    }

    // Name is present, so hide any old error.
    setError("");
    // Do not call the API here. Saving is a later ticket.
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create a course</h2>

      <label htmlFor="course-name">Course name</label>
      <input
        id="course-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <label htmlFor="course-description">Description</label>
      <textarea
        id="course-description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />

      <button type="submit">Create</button>

      {/* Error sits under the button and only renders when error is not empty. */}
      {error !== "" && <p className="form-error">{error}</p>}
    </form>
  );
}

export default CourseForm;