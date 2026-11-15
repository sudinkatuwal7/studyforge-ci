import TodoPanel from "../components/todos/TodoPanel";

// /tasks: the student's full to-do list across all courses, with the form to add a task.
// refreshKey changes when a course is created, so the task form's course list stays current.
export default function TasksPage({ refreshKey }: { refreshKey: number }) {
  return (
    <div className="dashboard-page tasks-page">
      <TodoPanel refreshKey={refreshKey} />
    </div>
  );
}
