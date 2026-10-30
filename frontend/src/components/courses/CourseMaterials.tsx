import { useEffect, useId, useRef, useState } from "react";
import { DocumentRequestError, listDocuments } from "../../api/documents";
import { useAuth } from "../../context/AuthContext";
import type { TrackedDocument } from "../../types/document";
import DocumentUpload from "../documents/DocumentUpload";
import MaterialItem from "../documents/MaterialItem";
import { reconcileSelection } from "../chat/chatReferences";

// One material source powers both workspace tabs and Pandu's reference picker.
type Props = { courseId: number; view?: "materials" | "notes"; onMaterialsChange?: (materials: TrackedDocument[]) => void };

export default function CourseMaterials({ courseId, view, onMaterialsChange }: Props) {
  const { accessToken, user } = useAuth();
  if (!user || !accessToken) return <p role="alert">Sign in to view course materials.</p>;
  return <Materials key={`${courseId}:${user.id}:${accessToken}`} courseId={courseId} accessToken={accessToken} view={view} onMaterialsChange={onMaterialsChange} />;
}

function Materials({ courseId, accessToken, view, onMaterialsChange }: Props & { accessToken: string }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [materials, setMaterials] = useState<TrackedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const removed = useRef(new Set<number>());

  useEffect(() => {
    const controller = new AbortController();
    listDocuments(courseId, accessToken, controller.signal).then((documents) => {
      if (controller.signal.aborted) return;
      if (documents.some((document) => document.course_id !== courseId)) throw new Error("Unexpected course.");
      // Preserve local changes made while the initial list was in flight.
      setMaterials((current) => {
        const byId = new Map<number, TrackedDocument>(documents.filter((doc) => !removed.current.has(doc.id))
          .map((doc) => [doc.id, { id: doc.id, name: doc.name, snapshot: doc }]));
        current.forEach((doc) => byId.set(doc.id, doc));
        return [...byId.values()].sort((a, b) =>
          (b.snapshot?.created_at ?? "9999").localeCompare(a.snapshot?.created_at ?? "9999") || b.id - a.id);
      });
      setError("");
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof DocumentRequestError ? cause.message : "Materials could not be loaded. Please try again.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [courseId, accessToken, reload]);

  // Publish uploads, renames, deletions, and status updates without another API request.
  useEffect(() => { onMaterialsChange?.(materials); }, [materials, onMaterialsChange]);

  // Fall back to the first material if the previous selection was removed.
  const selectable = materials.map((item) => ({ id: String(item.id), documentId: item.id, available: true }));
  const retained = reconcileSelection(selectable, selectedId === null ? [] : [String(selectedId)], 1)[0];
  const selected = retained ? Number(retained) : materials[0]?.id;
  const search = query.trim().toLowerCase();
  const matchesSearch = (name: string) => !search || name.toLowerCase().includes(search);
  const visibleMaterials = materials.filter((item) => matchesSearch(item.name));

  return <section className="course-materials" aria-labelledby={`course-${courseId}-materials`}>
    <h3 id={`course-${courseId}-materials`}>{view === "notes" ? "Study notes" : "Course materials"}</h3>
    {view === "notes" && materials.length > 0 && <label>Choose a material<select value={selected} onChange={(event) => setSelectedId(Number(event.target.value))}>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {/* Keep uploads in the Materials tab while preserving this mounted component. */}
    <div hidden={view === "notes"}>
    <DocumentUpload courseId={courseId} onDocumentSaved={(document) => {
      setNotice("");
      setMaterials((current) => [document, ...current.filter((item) => item.id !== document.id)]);
    }} />
    </div>
    {loading && <p role="status">Loading materials...</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <div><p role="alert" className="document-error">{error}</p><button disabled={loading} onClick={() => {
      setLoading(true); setReload((value) => value + 1);
    }}>Retry loading materials</button></div>}
    {!loading && !error && !materials.length && <p>No materials uploaded yet.</p>}
    <div className="material-library">
      <div className="material-library-toolbar" hidden={view === "notes" || materials.length === 0}>
        <h4 id={`course-${courseId}-library`}>Materials</h4>
        <label htmlFor={searchId}>Search materials</label>
        <input id={searchId} type="search" value={query} placeholder="Search by name" onChange={(event) => setQuery(event.target.value)} />
        {!loading && !error && materials.length > 0 && visibleMaterials.length === 0 && <p>No materials match that search.</p>}
      </div>
    <ul className="material-list" aria-labelledby={view === "notes" ? undefined : `course-${courseId}-library`}>
      {/* Notes display only the selected material. Search hides other names without unmounting them. */}
      {materials.map((tracked) => <li key={tracked.id} hidden={(view === "notes" && tracked.id !== selected) || (view !== "notes" && !matchesSearch(tracked.name))}><MaterialItem view={view} tracked={tracked} courseId={courseId} accessToken={accessToken}
        onStatusChange={(document) => setMaterials((current) => current.map((item) => item.id === document.id ? { ...item, snapshot: document } : item))}
        onRenamed={(document) => setMaterials((current) => current.map((item) => item.id === document.id ? document : item))}
        onDeleted={() => {
          removed.current.add(tracked.id);
          setMaterials((current) => current.filter((item) => item.id !== tracked.id));
          setNotice("Material deleted.");
        }} /></li>)}
    </ul>
    </div>
  </section>;
}
