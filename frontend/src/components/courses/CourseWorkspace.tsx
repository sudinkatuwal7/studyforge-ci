import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Course } from "../../types/course";
import type { TrackedDocument } from "../../types/document";
import ConnectedCourseChat from "../chat/ConnectedCourseChat";
import CourseMaterials from "./CourseMaterials";
import CourseTasks from "./CourseTasks";
import { type CourseSection, coursePath, courseSections } from "./courseSections";
import NotesPanel from "../notes/NotesPanel";
import QuizPanel from "../quizzes/QuizPanel";
import "../../styles/course-workspace.css";

// Matches the compact breakpoint in course-workspace.css and dashboard.css.
const compactQuery = "(max-width: 64rem)";
export default function CourseWorkspace({ course, section }: { course: Course; section: CourseSection }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = courseSections.find((item) => item.slug === section)!.label;
  // Without ?pandu, start with the assistant collapsed at the mobile and tablet breakpoint.
  const [assistantOpenByDefault] = useState(() => !window.matchMedia?.(compactQuery).matches);
  const pandu = searchParams.get("pandu");
  const assistantOpen = pandu === "open" ? true : pandu === "closed" ? false : assistantOpenByDefault;

  // Each section switch and Pandu toggle adds a history entry, so Back restores the previous view.
  // Changing only :section or ?pandu keeps this component mounted, so chat and quiz work survive.
  function showSection(next: CourseSection) {
    if (next === section) return;
    // Keep ?pandu so switching sections does not open or close Pandu.
    navigate({ pathname: coursePath(course.id, next), search });
  }
  function toggleAssistant() {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("pandu", assistantOpen ? "closed" : "open");
      return next;
    });
  }
  const toggleRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  // Resizing into the compact view can hide a focused course control.
  useEffect(() => {
    const compact = window.matchMedia?.(compactQuery);
    if (!compact || !assistantOpen) return;
    const rescueFocus = () => {
      if (compact.matches && contentRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
    };
    compact.addEventListener("change", rescueFocus);
    return () => compact.removeEventListener("change", rescueFocus);
  }, [assistantOpen]);
  // CourseMaterials owns fetching; this shared snapshot feeds Pandu's references.
  const [materials, setMaterials] = useState<TrackedDocument[]>([]);
  return <section className="course-workspace" aria-label={`${course.name} workspace`}>
    <div className={`course-workspace-grid${assistantOpen ? "" : " course-workspace-grid-collapsed"}`}>
      {/* Inside the grid so Pandu can start on the same line instead of below this header. */}
      <header className="course-workspace-header">
        <Link to="/">← My courses</Link>
        <h2>{course.name}</h2>
        {course.description && <p>{course.description}</p>}
      </header>
      <section ref={contentRef} className="course-content" aria-label="Course content">
        <div className="course-tabs" role="tablist" aria-label="Course sections">
          {/* Arrow, Home, and End keys follow the accessible tabs keyboard pattern. */}
          {courseSections.map(({ slug, label: name }, index) => <button key={slug} id={`tab-${name}`} role="tab" aria-selected={tab === name} aria-controls={`panel-${name}`} tabIndex={tab === name ? 0 : -1} onClick={() => showSection(slug)} onKeyDown={(event) => {
            const count = courseSections.length;
            const next = event.key === "ArrowRight" ? (index + 1) % count : event.key === "ArrowLeft" ? (index + count - 1) % count : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : -1;
            if (next >= 0) { event.preventDefault(); showSection(courseSections[next].slug); document.getElementById(`tab-${courseSections[next].label}`)?.focus(); }
          }}>{name}</button>)}
        </div>
        <div className="course-content-scroll">
          <div role="tabpanel" id="panel-Materials" aria-labelledby="tab-Materials" hidden={tab !== "Materials"}>
            <CourseMaterials courseId={course.id} onMaterialsChange={setMaterials} />
          </div>
          {/* Stays mounted while hidden so a selection or generation in progress survives a tab switch. */}
          <div role="tabpanel" id="panel-Notes" aria-labelledby="tab-Notes" hidden={tab !== "Notes"} className="course-notes">
            <NotesPanel courseId={course.id} materials={materials} />
          </div>
          {/* Stays mounted while hidden so a quiz in progress survives a tab switch. */}
          <div role="tabpanel" id="panel-Quizzes" aria-labelledby="tab-Quizzes" hidden={tab !== "Quizzes"} className="course-quizzes">
            <QuizPanel courseId={course.id} materials={materials} />
          </div>
          <div role="tabpanel" id="panel-Tasks" aria-labelledby="tab-Tasks" hidden={tab !== "Tasks"}>
            <CourseTasks key={course.id} courseId={course.id} />
          </div>
        </div>
      </section>
      <button ref={toggleRef} type="button" className="assistant-toggle" aria-expanded={assistantOpen} aria-controls="course-assistant" onClick={() => {
        toggleAssistant();
        toggleRef.current?.focus();
      }}>
        AI Assistant
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={assistantOpen ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
        </svg>
      </button>
      <div id="course-assistant" className="course-assistant" inert={!assistantOpen}>
        <ConnectedCourseChat key={course.id} courseId={course.id} materials={materials} />
      </div>
    </div>
  </section>;
}
