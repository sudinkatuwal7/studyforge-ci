import { useParams } from "react-router-dom";
import NoteDetail from "../components/notes/NoteDetail";

// /notes/:notesId: one saved note in full, with edit and delete.
// The top bar's "Notes" (AppShell) is the page's only <h1>.
export default function NoteDetailPage() {
  const { notesId = "" } = useParams();
  return (
    <div className="dashboard-page note-detail-page">
      <NoteDetail notesId={notesId} />
    </div>
  );
}
