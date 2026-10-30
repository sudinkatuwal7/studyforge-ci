export type NotesKeyConcept = {
  term: string;
  explanation: string;
};

export type NotesSection = {
  heading: string;
  key_concepts: NotesKeyConcept[];
  points: string[];
};

export type CourseNotes = {
  id: number;
  title: string;
  course: number;
  overview: string;
  sections: NotesSection[];
  source_documents: { id: number; name: string }[];
  created_at: string;
};
