// Calendar dates and clock times stay as strings, exactly as returned by Django.
export interface StudySession {
  id: number;
  title: string;
  course: number;
  date: string;
  time: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateStudySessionInput {
  // The form generates this once and reuses it for an unchanged submission retry.
  creation_key: string;
  title: string;
  course: number;
  date: string;
  time?: string | null;
}

// PATCH cannot change the session ID, timestamps, or creation key.
export type UpdateStudySessionInput = Partial<
  Pick<StudySession, "title" | "course" | "date" | "time">
>;
