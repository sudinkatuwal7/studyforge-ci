import { describe, expect, it } from "vitest";
import type { TodoItem } from "../../types/todo";
import { sortTodos } from "./sortTodos";

function task(overrides: Partial<TodoItem> & Pick<TodoItem, "id">): TodoItem {
  return {
    title: `Task ${overrides.id}`,
    course: 1,
    due_date: null,
    is_completed: false,
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("task ordering", () => {
  it("puts incomplete tasks first, nearest due dates next, and undated tasks last", () => {
    const sorted = sortTodos([
      task({ id: 1, title: "Done soon", is_completed: true, due_date: "2026-10-18" }),
      task({ id: 2, title: "No date" }),
      task({ id: 3, title: "Later", due_date: "2026-11-01" }),
      task({ id: 4, title: "Soon", due_date: "2026-10-20" }),
      task({ id: 5, title: "Done later", is_completed: true, due_date: null, created_at: "2026-10-03T00:00:00Z" }),
    ]);

    expect(sorted.map((todo) => todo.title)).toEqual([
      "Soon",
      "Later",
      "No date",
      "Done soon",
      "Done later",
    ]);
  });
});
