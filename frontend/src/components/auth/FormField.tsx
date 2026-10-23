import type { ComponentProps, ReactNode } from "react";

type FormFieldProps = ComponentProps<"input"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  // Optional decorative icon shown inside the input, on the left.
  icon?: ReactNode;
  // Optional control shown beside the input, such as a show/hide password button.
  trailing?: ReactNode;
};

// One labelled input with its hint and error text wired up for screen readers.
export default function FormField({
  id,
  label,
  error,
  hint,
  icon,
  trailing,
  ...inputProps
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input-row">
        {icon && <span className="field-icon">{icon}</span>}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {trailing}
      </div>
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
