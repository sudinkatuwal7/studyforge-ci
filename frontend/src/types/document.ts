export type DocumentStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export type DocumentError = { code: string; message: string };

export type StudyDocument = {
  id: number;
  course_id: number;
  name: string;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
  error: DocumentError | null;
};

export type TrackedDocument = {
  id: number;
  name: string;
  snapshot: StudyDocument | null;
  // Present for a file chosen in this visit. The document API does not return a byte size.
  sizeBytes?: number;
};

// Whether the course's material list has loaded, so Notes and Quizzes can tell
// "still loading" and "could not load" apart from "no materials yet".
export type MaterialsLoadState = "loading" | "error" | "ready";
