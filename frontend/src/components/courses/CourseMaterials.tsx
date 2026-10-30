import { useEffect, useId, useRef, useState } from "react";
import { DocumentRequestError, listDocuments } from "../../api/documents";
import { useAuth } from "../../context/AuthContext";
import type { TrackedDocument } from "../../types/document";
import DocumentUpload from "../documents/DocumentUpload";
import MaterialItem from "../documents/MaterialItem";

// One material source powers the Materials, Notes, and Quizzes tabs and Pandu's reference picker.
type Props = { courseId: number; onMaterialsChange?: (materials: TrackedDocument[]) => void };

export default function CourseMaterials({ courseId, onMaterialsChange }: Props) {
  const { accessToken, user } = useAuth();
  if (!user || !accessToken) return <p role="alert">Sign in to view course materials.</p>;
  return <Materials key={`${courseId}:${user.id}:${accessToken}`} courseId={courseId} accessToken={accessToken} onMaterialsChange={onMaterialsChange} />;
}

function Materials({ courseId, accessToken, onMaterialsChange }: Props & { accessToken: string }) {
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

  const search = query.trim().toLowerCase();
  const matchesSearch = (name: string) => !search || name.toLowerCase().includes(search);
  const visibleMaterials = materials.filter((item) => matchesSearch(item.name));

  return <section className="course-materials" aria-labelledby={`course-${courseId}-materials`}>
    <h3 id={`course-${courseId}-materials`}>Course materials</h3>
    <DocumentUpload courseId={courseId} onDocumentSaved={(document) => {
      setNotice("");
      setMaterials((current) => [document, ...current.filter((item) => item.id !== document.id)]);
    }} />
    {loading && <p role="status">Loading materials...</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <div><p role="alert" className="document-error">{error}</p><button disabled={loading} onClick={() => {
      setLoading(true); setReload((value) => value + 1);
    }}>Retry loading materials</button></div>}
    {!loading && !error && !materials.length && <p>No materials uploaded yet.</p>}
    <div className="material-library">
      <div className="material-library-toolbar" hidden={materials.length === 0}>
        <h4 id={`course-${courseId}-library`}>Materials</h4>
        <label htmlFor={searchId}>Search materials</label>
        <input id={searchId} type="search" value={query} placeholder="Search by name" onChange={(event) => setQuery(event.target.value)} />
        {!loading && !error && materials.length > 0 && visibleMaterials.length === 0 && <p>No materials match that search.</p>}
      </div>
    <ul className="material-list" aria-labelledby={`course-${courseId}-library`}>
      {/* Search hides other names without unmounting them. */}
      {materials.map((tracked) => <li key={tracked.id} hidden={!matchesSearch(tracked.name)}><MaterialItem tracked={tracked} courseId={courseId} accessToken={accessToken}
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
