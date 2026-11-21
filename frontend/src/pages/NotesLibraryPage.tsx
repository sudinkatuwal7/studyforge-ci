import NotesLibrary from "../components/notes/NotesLibrary";

// /notes: every note the student has saved, across courses, filterable by course.
// The top bar's "My Notes" (AppShell) is the page's only <h1>.
export default function NotesLibraryPage() {
  return (
    <div className="dashboard-page notes-library-page">
      <NotesLibrary />
    </div>
  );
}
