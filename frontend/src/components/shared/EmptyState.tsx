import type { ReactNode } from "react";

// One look for every "nothing here yet" message: say what is missing, then offer the next step.
// Loading and error states are rendered separately by each caller, so they never look empty.
export default function EmptyState({ message, children }: { message: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p>{message}</p>
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  );
}
