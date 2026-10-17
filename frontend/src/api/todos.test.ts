import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateTodoInput, TodoItem } from "../types/todo";
import { ApiError } from "./client";
import { createTodo, listTodos, updateTodoCompletion } from "./todos";

const token = "test-access-token";
const savedTodo: TodoItem = {
  id: 12,
  title: "Finish homework",
  course: 7,
  due_date: "2026-10-20",
  is_completed: false,
  created_at: "2026-10-17T00:30:00Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("To-Do API requests", () => {
  it.each([
    { label: "saved tasks", items: [savedTodo] },
    { label: "an empty list", items: [] },
  ])("returns $label", async ({ items }) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(items));
    vi.stubGlobal("fetch", fetch);

    expect(await listTodos(token)).toEqual(items);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/todos/");
    expect(options.method ?? "GET").toBe("GET");
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(options.body).toBeUndefined();
  });

  const creationCases: { label: string; input: CreateTodoInput }[] = [
    { label: "a due date", input: { creation_key: "11111111-1111-4111-8111-111111111111", title: savedTodo.title, course: 7, due_date: "2026-10-20" } },
    { label: "an omitted due date", input: { creation_key: "22222222-2222-4222-8222-222222222222", title: savedTodo.title, course: 7 } },
    { label: "a null due date", input: { creation_key: "33333333-3333-4333-8333-333333333333", title: savedTodo.title, course: 7, due_date: null } },
  ];

  it.each(creationCases)("creates a task with $label", async ({ input }) => {
    const returnedTodo = { ...savedTodo, due_date: input.due_date ?? null };
    const fetch = vi.fn().mockResolvedValue(Response.json(returnedTodo, { status: 201 }));
    vi.stubGlobal("fetch", fetch);

    expect(await createTodo(token, input)).toEqual(returnedTodo);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/todos/");
    expect(options.method).toBe("POST");
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(new Headers(options.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(options.body as string)).toEqual(input);
  });

  it.each([true, false])("PATCH changes only completion to %s", async (isCompleted) => {
    const returnedTodo = { ...savedTodo, is_completed: isCompleted };
    const fetch = vi.fn().mockResolvedValue(Response.json(returnedTodo));
    vi.stubGlobal("fetch", fetch);

    expect(await updateTodoCompletion(token, 12, isCompleted)).toEqual(returnedTodo);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/todos/12/");
    expect(options.method).toBe("PATCH");
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(new Headers(options.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(options.body as string)).toEqual({ is_completed: isCompleted });
  });
});

const operations = [
  { name: "list", call: (accessToken: string | null) => listTodos(accessToken), errorStatus: 401 },
  {
    name: "create",
    call: (accessToken: string | null) => createTodo(accessToken, {
      creation_key: "44444444-4444-4444-8444-444444444444",
      title: "Study",
      course: 7,
    }),
    errorStatus: 400,
  },
  {
    name: "update completion",
    call: (accessToken: string | null) => updateTodoCompletion(accessToken, 12, true),
    errorStatus: 404,
  },
];

describe.each(operations)("To-Do API errors: $name", ({ call, errorStatus }) => {
  it("rejects a missing token without sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(call(null)).rejects.toThrow("Log in to manage your tasks.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([errorStatus, 500])("preserves HTTP status %s without retrying", async (status) => {
    // A plain-text response also checks that failures do not require valid JSON.
    const fetch = vi.fn().mockResolvedValue(new Response("Request failed", { status }));
    vi.stubGlobal("fetch", fetch);

    const error = await call(token).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("passes network failures to the caller without retrying", async () => {
    const failure = new TypeError("Failed to fetch");
    const fetch = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal("fetch", fetch);

    await expect(call(token)).rejects.toBe(failure);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
