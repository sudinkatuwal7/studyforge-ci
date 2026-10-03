import DocumentUpload from "../documents/DocumentUpload";

type CourseMaterialsProps = {
  // The parent page passes the ID of the course that was successfully loaded.
  courseId: number;
};

// The uploader uses this course ID and the shared authentication context.
export default function CourseMaterials({ courseId }: CourseMaterialsProps) {
  // Connect the section to its heading so screen readers can identify it.
  const headingId = `course-${courseId}-materials`;

  return (
    <section className="course-materials" aria-labelledby={headingId}>
      <h3 id={headingId}>Course materials</h3>
      <DocumentUpload courseId={courseId} />
    </section>
  );
}
