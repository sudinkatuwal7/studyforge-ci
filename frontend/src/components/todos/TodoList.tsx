import type { Course } from "../../types/course";
import type { TodoItem } from "../../types/todo";
import "./TodoList.css";

type TodoListProps = {
  todos: TodoItem[];
  courses: Course[];
  updatingId: number | null;
  onToggle: (todo: TodoItem) => void;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return "No due date";
  const [year, month, day] = dueDate.split("-").map(Number);
  const monthName = MONTHS[month - 1];
  if (!year || !monthName || !day) return dueDate;
  return `${monthName} ${day}, ${year}`;
}

export default function TodoList({ todos, courses, updatingId, onToggle }: TodoListProps) {
  const courseNames = new Map(courses.map((course) => [course.id, course.name]));

  if (todos.length === 0) {
    return <p className="todo-empty">You have no tasks yet.</p>;
  }

  return (
    <ul>
      {todos.map((todo) => {
        const courseName = courseNames.get(todo.course) ?? "Unknown course";
        return (
          <li key={todo.id} className={todo.is_completed ? "todo-item todo-item-completed" : "todo-item"}>
            <input
              type="checkbox"
              checked={todo.is_completed}
              disabled={updatingId === todo.id}
              aria-label={`${todo.is_completed ? "Mark incomplete" : "Mark complete"}: ${todo.title}`}
              onChange={() => onToggle(todo)}
            />
            <div>
              <strong className="todo-item-title">{todo.title}</strong>
              <p>{courseName}</p>
              <p>{formatDueDate(todo.due_date)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
