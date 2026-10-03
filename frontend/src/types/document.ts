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
};
