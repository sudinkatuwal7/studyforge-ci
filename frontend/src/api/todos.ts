import { ApiError, getJson, postJson, request } from "./client";
import type { CreateTodoInput, TodoItem } from "../types/todo";

// Components pass the current access token from the authentication provider.
export async function listTodos(accessToken: string | null): Promise<TodoItem[]> {
  if (!accessToken) {
    throw new Error("Log in to manage your tasks.");
  }

  return getJson<TodoItem[]>("/todos/", accessToken);
}

export async function createTodo(
  accessToken: string | null,
  todo: CreateTodoInput,
): Promise<TodoItem> {
  if (!accessToken) {
    throw new Error("Log in to manage your tasks.");
  }

  return postJson<TodoItem>("/todos/", todo, accessToken);
}

export async function updateTodoCompletion(
  accessToken: string | null,
  todoId: number,
  isCompleted: boolean,
): Promise<TodoItem> {
  if (!accessToken) {
    throw new Error("Log in to manage your tasks.");
  }

  // Send only the completion field; the backend preserves the other task data.
  const response = await request(
    `/todos/${todoId}/`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_completed: isCompleted }),
    },
    accessToken,
  );

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  return (await response.json()) as TodoItem;
}

export async function updateTodoTitle(
  accessToken: string | null,
  todoId: number,
  title: string,
): Promise<TodoItem> {
  if (!accessToken) throw new Error("Log in to manage your tasks.");
  const response = await request(`/todos/${todoId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }, accessToken);
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { title?: string[] } | null;
    throw new ApiError(response.status, data?.title?.[0]);
  }
  return await response.json() as TodoItem;
}

export async function deleteTodo(accessToken: string | null, todoId: number): Promise<void> {
  if (!accessToken) throw new Error("Log in to manage your tasks.");
  const response = await request(`/todos/${todoId}/`, { method: "DELETE" }, accessToken);
  if (!response.ok) throw new ApiError(response.status);
}
