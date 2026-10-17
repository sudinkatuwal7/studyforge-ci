import { useEffect, useState } from "react";
import { listCourses } from "../../api/courses";
import { ApiError } from "../../api/client";
import { listTodos, updateTodoCompletion } from "../../api/todos";
import { useAuth } from "../../context/AuthContext";
import type { Course } from "../../types/course";
import type { TodoItem } from "../../types/todo";
import TodoForm from "./TodoForm";
import TodoList from "./TodoList";
import { sortTodos } from "./sortTodos";
import "./TodoList.css";

type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; courses: Course[]; todos: TodoItem[] };

function loadErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not load tasks.";
}

export default function TodoPanel({
  refreshKey,
  onTodos,
}: {
  refreshKey: number;
  onTodos?: (todos: TodoItem[]) => void;
}) {
  const { accessToken } = useAuth();
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.all([listCourses(accessToken), listTodos(accessToken)])
      .then(([courses, todos]) => {
        if (!cancelled) setState({ status: "ready", courses, todos: sortTodos(todos) });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", message: loadErrorMessage(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshKey]);

  useEffect(() => {
    if (state.status === "ready") onTodos?.(state.todos);
  }, [onTodos, state]);

  function addTodo(todo: TodoItem) {
    setState((current) => {
      if (current.status !== "ready") return current;
      return { ...current, todos: sortTodos([...current.todos, todo]) };
    });
  }

  async function toggleTodo(todo: TodoItem) {
    if (updatingId !== null) return;
    setUpdatingId(todo.id);
    setToggleError("");
    try {
      const updated = await updateTodoCompletion(accessToken, todo.id, !todo.is_completed);
      setState((current) => {
        if (current.status !== "ready") return current;
        return {
          ...current,
          todos: sortTodos(current.todos.map((item) => (item.id === updated.id ? updated : item))),
        };
      });
    } catch {
      setToggleError("Could not update the task. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section id="tasks" className="todo-panel" aria-labelledby="tasks-heading">
      <div className="todo-list">
        <h2 id="tasks-heading">My To-Do List</h2>
        {state.status === "loading" && <p role="status">Loading tasks...</p>}
        {state.status === "error" && <p className="form-error" role="alert">{state.message}</p>}
        {state.status === "ready" && (
          <TodoList
            todos={state.todos}
            courses={state.courses}
            updatingId={updatingId}
            onToggle={toggleTodo}
          />
        )}
        {toggleError && <p className="form-error" role="alert">{toggleError}</p>}
      </div>
      {state.status === "ready" && <TodoForm courses={state.courses} onCreated={addTodo} />}
    </section>
  );
}
