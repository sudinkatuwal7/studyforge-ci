import { Link, useLocation } from "react-router-dom";
import { coursePath } from "./courseSections";

// Notes and Quizzes need materials first: this opens the course's Materials section,
// keeping ?pandu so Pandu stays open or closed as it was.
export default function GoToMaterialsLink({ courseId }: { courseId: number }) {
  const { search } = useLocation();
  return (
    <Link className="empty-state-action" to={{ pathname: coursePath(courseId, "materials"), search }}>
      Go to Materials
    </Link>
  );
}
