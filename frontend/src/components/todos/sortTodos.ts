import type { TodoItem } from "../../types/todo";

// Incomplete tasks come first. Dated tasks are nearest-first, then undated tasks.
export function sortTodos(todos: readonly TodoItem[]): TodoItem[] {
  return [...todos].sort((left, right) => {
    if (left.is_completed !== right.is_completed) {
      return left.is_completed ? 1 : -1;
    }
    if (left.due_date !== right.due_date) {
      if (left.due_date === null) return 1;
      if (right.due_date === null) return -1;
      return left.due_date.localeCompare(right.due_date);
    }
    const byCreatedAt = left.created_at.localeCompare(right.created_at);
    return byCreatedAt !== 0 ? byCreatedAt : left.id - right.id;
  });
}
