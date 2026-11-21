export type NotesKeyConcept = {
  term: string;
  explanation: string;
};

export type NotesSection = {
  heading: string;
  key_concepts: NotesKeyConcept[];
  points: string[];
};

// Mirrors the fixed lists in backend apps/notes/models.py (SCRUM-86). The
// backend rejects any other value with a 400, so a drift fails loudly.
export type NoteType = "summary" | "outline" | "key_concepts";
export type DetailLevel = "brief" | "standard" | "detailed";
export type NoteFormat = "bullets" | "paragraphs";

export type NotesOptions = {
  note_type: NoteType;
  detail_level: DetailLevel;
  format: NoteFormat;
};

type Choice<T> = { value: T; label: string; help: string };

export const NOTE_TYPES: Choice<NoteType>[] = [
  { value: "summary", label: "Summary", help: "The main ideas and how they connect." },
  { value: "outline", label: "Outline", help: "Every topic in the order it is taught." },
  { value: "key_concepts", label: "Key concepts", help: "A glossary of terms and definitions." },
];

export const DETAIL_LEVELS: Choice<DetailLevel>[] = [
  { value: "brief", label: "Brief", help: "Only the essentials." },
  { value: "standard", label: "Standard", help: "Every definition, rule and date." },
  { value: "detailed", label: "Detailed", help: "Adds examples, conditions and exceptions. Takes longer." },
];

export const NOTE_FORMATS: Choice<NoteFormat>[] = [
  { value: "bullets", label: "Bullet points", help: "Short, scannable points." },
  { value: "paragraphs", label: "Paragraphs", help: "Connected prose." },
];

// What notes looked like before options existed; also the backend default.
export const DEFAULT_NOTES_OPTIONS: NotesOptions = { note_type: "outline", detail_level: "standard", format: "bullets" };

export type CourseNotes = {
  id: number;
  title: string;
  course: number;
  options: NotesOptions;
  overview: string;
  sections: NotesSection[];
  source_documents: { id: number; name: string }[];
  created_at: string;
  updated_at: string;
};

// One row of the notes library (GET /notes/): no content, so the list stays small.
export type CourseNotesSummary = Pick<CourseNotes, "id" | "title" | "course" | "options" | "created_at" | "updated_at"> & {
  course_name: string;
};

// The only fields a student may edit. Owner, course, options and sources are read-only.
export type NotesChanges = Partial<Pick<CourseNotes, "title" | "overview" | "sections">>;
