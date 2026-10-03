type CourseMaterialsProps = {
  // The parent page passes the ID of the course that was successfully loaded.
  courseId: number;
};

// Upload integration belongs here. Use courseId for the course-scoped API
// and useAuth() for the current access token.
export default function CourseMaterials({ courseId }: CourseMaterialsProps) {
  // Connect the section to its heading so screen readers can identify it.
  const headingId = `course-${courseId}-materials`;

  return (
    <section className="course-materials" aria-labelledby={headingId}>
      {/* This is a placeholder; the actual upload form will be connected later. */}
      <h3 id={headingId}>Course materials</h3>
      <p>PDF uploads will be available here soon.</p>
    </section>
  );
}
