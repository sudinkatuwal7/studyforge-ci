import { type ChangeEvent, type SubmitEvent, useRef, useState } from "react";
import { AuthError, login, register } from "../api/auth";
import FormField from "../components/auth/FormField";
import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  UserIcon,
} from "../components/auth/icons";
import {
  validateEmail,
  validatePassword,
  validatePasswordMatch,
} from "../components/auth/validation";
import { useAuth } from "../context/AuthContext";

type RegisterPageProps = {
  // Switches back to the log in card.
  onSignIn: () => void;
};

type Field = "firstName" | "lastName" | "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<Field, string>>;

// Top-to-bottom order, used to focus the first field with a problem.
const FIELD_ORDER: Field[] = ["firstName", "lastName", "email", "password", "confirmPassword"];

// Backend field names -> form fields.
const SERVER_FIELDS: Partial<Record<string, Field>> = {
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  password: "password",
};

const EMPTY_VALUES: Record<Field, string> = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const UNTOUCHED: Record<Field, boolean> = {
  firstName: false,
  lastName: false,
  email: false,
  password: false,
  confirmPassword: false,
};

const ALL_TOUCHED: Record<Field, boolean> = {
  firstName: true,
  lastName: true,
  email: true,
  password: true,
  confirmPassword: true,
};

export default function RegisterPage({ onSignIn }: RegisterPageProps) {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [touched, setTouched] = useState(UNTOUCHED);
  // Errors returned by the backend, shown until the user edits that field.
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<Partial<Record<Field, HTMLInputElement | null>>>({});
  const { saveLogin } = useAuth();

  const clientErrors: FieldErrors = {
    email: validateEmail(values.email),
    password: validatePassword(values.password),
    confirmPassword: validatePasswordMatch(values.password, values.confirmPassword),
  };

  function visibleError(field: Field) {
    return (touched[field] ? clientErrors[field] : undefined) ?? serverErrors[field];
  }

  function updateValue(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setServerErrors((current) => ({ ...current, [field]: undefined }));
  }

  // Shared props for each input: value, error, change/blur handlers, and a ref for focus.
  function fieldProps(field: Field) {
    return {
      value: values[field],
      error: visibleError(field),
      onChange: (event: ChangeEvent<HTMLInputElement>) => updateValue(field, event.target.value),
      onBlur: () => setTouched((current) => ({ ...current, [field]: true })),
      ref: (element: HTMLInputElement | null) => {
        inputs.current[field] = element;
      },
    };
  }

  function focusFirst(errors: FieldErrors) {
    const first = FIELD_ORDER.find((field) => errors[field]);
    if (first) {
      inputs.current[first]?.focus();
    }
  }

  function showRegisterError(error: unknown) {
    if (!(error instanceof AuthError)) {
      setFormError("Sign up failed. Please try again.");
      return;
    }
    if (error.kind !== "validation") {
      setFormError(error.message);
      return;
    }

    // Put each backend message under its field. Anything else goes in the top alert.
    const byField: FieldErrors = {};
    const other: string[] = [];
    for (const [key, messages] of Object.entries(error.fieldErrors)) {
      const field = SERVER_FIELDS[key];
      if (field) {
        byField[field] = messages.join(" ");
      } else {
        other.push(...messages);
      }
    }

    setServerErrors(byField);
    setFormError(other.length > 0 ? other.join(" ") : error.message);
    focusFirst(byField);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(ALL_TOUCHED);
    setFormError("");
    setServerErrors({});

    if (Object.values(clientErrors).some(Boolean)) {
      focusFirst(clientErrors);
      return;
    }

    setSubmitting(true);

    let email: string;
    try {
      const user = await register({
        email: values.email.trim(),
        password: values.password,
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
      });
      // Use the email the server saved, because it lowercases it.
      email = user.email;
    } catch (error) {
      showRegisterError(error);
      setSubmitting(false);
      return;
    }

    // Registration does not sign the user in, so log in with the same credentials.
    try {
      saveLogin(await login(email, values.password));
    } catch {
      setFormError(
        "Your account was created, but we couldn't log you in automatically. Please log in.",
      );
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="register-heading">
      <h2 id="register-heading" className="auth-card-title">
        Create your account
      </h2>
      <p className="auth-subtitle">Set up your study space in under a minute.</p>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        {formError && (
          <p className="auth-alert" role="alert">
            {formError}
          </p>
        )}

        <div className="auth-name-row">
          <FormField
            id="register-first-name"
            label="First name (optional)"
            autoComplete="given-name"
            icon={<UserIcon />}
            {...fieldProps("firstName")}
          />
          <FormField
            id="register-last-name"
            label="Last name (optional)"
            autoComplete="family-name"
            icon={<UserIcon />}
            {...fieldProps("lastName")}
          />
        </div>

        <FormField
          id="register-email"
          label="Email address"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          icon={<MailIcon />}
          {...fieldProps("email")}
        />

        <FormField
          id="register-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Create a password"
          hint="At least 8 characters. Avoid common words or only numbers."
          icon={<LockIcon />}
          {...fieldProps("password")}
          trailing={
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? "Hide passwords" : "Show passwords"}
              aria-controls="register-password register-confirm-password"
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          }
        />

        <FormField
          id="register-confirm-password"
          label="Confirm password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          icon={<LockIcon />}
          {...fieldProps("confirmPassword")}
        />

        <button
          type="submit"
          className="auth-submit"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Creating account...
            </>
          ) : (
            <>
              Create account
              <ArrowRightIcon />
            </>
          )}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account?{" "}
        <button type="button" className="link-button strong" onClick={onSignIn}>
          Log in
          <ArrowRightIcon />
        </button>
      </p>
    </section>
  );
}
