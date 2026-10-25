import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Course } from "../../types/course";
import type { TrackedDocument } from "../../types/document";
import DemoCourseChat from "../chat/DemoCourseChat";
import CourseMaterials from "./CourseMaterials";
import "../../styles/course-workspace.css";

const tabs = ["Materials", "Notes", "Quizzes"] as const;
export default function CourseWorkspace({ course }: { course: Course }) {
  // Materials is the default workspace section for every course visit.
  const [tab, setTab] = useState<typeof tabs[number]>("Materials");
  // Start with the assistant collapsed at the mobile and tablet breakpoint.
  const [assistantOpen, setAssistantOpen] = useState(() => !window.matchMedia?.("(max-width: 64rem)").matches);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // CourseMaterials owns fetching; this shared snapshot feeds Pandu's references.
  const [materials, setMaterials] = useState<TrackedDocument[]>([]);
  return <section className="course-workspace" aria-label={`${course.name} workspace`}>
    <header className="course-workspace-header">
      <Link to="/">← My courses</Link>
      <h2>{course.name}</h2>
      {course.description && <p>{course.description}</p>}
    </header>
    <div className={`course-workspace-grid${assistantOpen ? "" : " course-workspace-grid-collapsed"}`}>
      <section className="course-content" aria-label="Course content">
        <div className="course-tabs" role="tablist" aria-label="Course sections">
          {/* Arrow, Home, and End keys follow the accessible tabs keyboard pattern. */}
          {tabs.map((name, index) => <button key={name} id={`tab-${name}`} role="tab" aria-selected={tab === name} aria-controls={name === "Quizzes" ? "panel-Quizzes" : "panel-study"} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={(event) => {
            const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); setTab(tabs[next]); document.getElementById(`tab-${tabs[next]}`)?.focus(); }
          }}>{name}{name === "Quizzes" && <span className="soon-badge">Soon</span>}</button>)}
        </div>
        <div className="course-content-scroll">
          <div role="tabpanel" id="panel-study" aria-labelledby={`tab-${tab === "Quizzes" ? "Materials" : tab}`} hidden={tab === "Quizzes"}>
            <CourseMaterials courseId={course.id} view={tab === "Notes" ? "notes" : "materials"} onMaterialsChange={setMaterials} />
          </div>
          <div role="tabpanel" id="panel-Quizzes" aria-labelledby="tab-Quizzes" hidden={tab !== "Quizzes"} className="quiz-placeholder">
            <span className="soon-badge">Coming soon</span><h3>A fresh way to test yourself.</h3><p>Quiz generation is not available yet. In the meantime, explore your materials and generate study notes.</p><button disabled>Generate quiz</button>
          </div>
        </div>
      </section>
      <button ref={toggleRef} type="button" className="assistant-toggle" aria-expanded={assistantOpen} aria-controls="course-assistant" onClick={() => {
        setAssistantOpen((open) => !open);
        toggleRef.current?.focus();
      }}>{assistantOpen ? "Hide AI Assistant" : "Show AI Assistant"}</button>
      {/* The course key clears demo messages and attachments when navigation changes. */}
      <div id="course-assistant" className="course-assistant" inert={!assistantOpen}>
        <DemoCourseChat key={course.id} courseId={course.id} materials={materials} />
      </div>
    </div>
  </section>;
}
