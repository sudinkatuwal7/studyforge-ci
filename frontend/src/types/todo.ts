// Task data returned by the backend. Dates arrive as strings in JSON.
export interface TodoItem {
  id: number;
  title: string;
  course: number;
  due_date: string | null;
  is_completed: boolean;
  created_at: string;
}

// The backend assigns the ID, creation time, and initial completion status.
export interface CreateTodoInput {
  creation_key: string;
  title: string;
  course: number;
  due_date?: string | null;
}
