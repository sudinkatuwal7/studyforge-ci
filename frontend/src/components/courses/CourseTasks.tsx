import { useEffect, useState } from "react";
import { listTodos } from "../../api/todos";
import { useAuth } from "../../context/AuthContext";
import type { TodoItem } from "../../types/todo";
import { sortTodos } from "../todos/sortTodos";
import "../todos/TodoList.css";

type TaskState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; todos: TodoItem[] };

export default function CourseTasks({ courseId }: { courseId: number }) {
  const { accessToken } = useAuth();
  const [state, setState] = useState<TaskState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    listTodos(accessToken)
      .then((todos) => {
        if (!cancelled) {
          // The API checks ownership; this filter selects the open course.
          setState({ status: "ready", todos: sortTodos(todos.filter((todo) => todo.course === courseId)) });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => { cancelled = true; };
  }, [accessToken, courseId, retry]);

  return (
    <section className="todo-panel todo-list" aria-labelledby="course-tasks-heading">
      <h2 id="course-tasks-heading">Course tasks</h2>
      {state.status === "loading" && <p role="status">Loading course tasks...</p>}
      {state.status === "error" && <>
        <p role="alert">Could not load course tasks.</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
      </>}
      {state.status === "ready" && (state.todos.length === 0 ? (
        <p className="todo-empty">No tasks for this course yet.</p>
      ) : (
        <ul>
          {state.todos.map((todo) => (
            <li key={todo.id} className={todo.is_completed ? "todo-item todo-item-completed" : "todo-item"}>
              <div>
                <strong className="todo-item-title">{todo.title}</strong>
                <p>{todo.is_completed ? "Completed" : "Pending"}</p>
                <p>{todo.due_date ? <>Due: <time dateTime={todo.due_date}>{todo.due_date}</time></> : "No due date"}</p>
              </div>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
