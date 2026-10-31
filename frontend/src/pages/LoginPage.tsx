import { type SubmitEvent, useRef, useState } from "react";
import { AuthError, login } from "../api/auth";
import FormField from "../components/auth/FormField";
import GoogleSignIn from "../components/auth/GoogleSignIn";
import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
} from "../components/auth/icons";
import type { SignInLock } from "../components/auth/useSignInLock";
import { validateEmail, validateRequired } from "../components/auth/validation";
import { type SignedOutReason, useAuth } from "../context/AuthContext";

type LoginPageProps = {
  // Shows the "Sign up" link when provided.
  onCreateAccount?: () => void;
  // Fills in the email field, after a sign-up whose automatic login failed.
  initialEmail?: string;
  // Shared with the other card, so only one sign-in request runs at a time.
  signInLock: SignInLock;
};

type Field = "email" | "password";

const SIGNED_OUT_MESSAGES: Record<SignedOutReason, string> = {
  signed_out: "You've been signed out.",
  expired: "Your session expired. Please sign in again.",
};

export default function LoginPage({
  onCreateAccount,
  initialEmail = "",
  signInLock,
}: LoginPageProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // A field shows its error only after the user leaves it or submits the form.
  const [touched, setTouched] = useState<Record<Field, boolean>>({
    email: false,
    password: false,
  });
  const [formError, setFormError] = useState("");
  const [googleError, setGoogleError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { saveLogin, signedOutReason } = useAuth();

  const fieldErrors: Record<Field, string | undefined> = {
    email: validateEmail(email),
    password: validateRequired(password, "Enter your password."),
  };

  function visibleError(field: Field) {
    return touched[field] ? fieldErrors[field] : undefined;
  }

  function markTouched(field: Field) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  // A new Google attempt or error replaces any error from the form.
  function showGoogleError(message: string) {
    setGoogleError(message);
    setFormError("");
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    setFormError("");
    setGoogleError("");

    // Move focus to the first problem so keyboard and screen-reader users find it.
    if (fieldErrors.email) {
      emailRef.current?.focus();
      return;
    }
    if (fieldErrors.password) {
      passwordRef.current?.focus();
      return;
    }

    if (!signInLock.acquire()) return;
    setSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      saveLogin(result);
    } catch (error) {
      setFormError(
        error instanceof AuthError
          ? error.message
          : "Log in failed. Please try again.",
      );
      if (error instanceof AuthError && error.kind === "credentials") {
        passwordRef.current?.select();
      }
    } finally {
      signInLock.release();
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="login-heading">
      <h2 id="login-heading" className="auth-card-title">
        Log in to StudyForge
      </h2>
      <p className="auth-subtitle">Same peaceful space. New progress ahead.</p>

      {/* noValidate: show our messages instead of the browser's pop-up bubbles. */}
      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        {formError ? (
          <p className="auth-alert" role="alert">
            {formError}
          </p>
        ) : (
          signedOutReason && (
            <p className="auth-notice" role="status">
              {SIGNED_OUT_MESSAGES[signedOutReason]}
            </p>
          )
        )}

        <FormField
          ref={emailRef}
          id="login-email"
          label="Email address"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          icon={<MailIcon />}
          value={email}
          error={visibleError("email")}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => markTouched("email")}
        />

        <div>
          <FormField
            ref={passwordRef}
            id="login-password"
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            icon={<LockIcon />}
            value={password}
            error={visibleError("password")}
            onChange={(event) => setPassword(event.target.value)}
            onBlur={() => markTouched("password")}
            trailing={
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-controls="login-password"
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            }
          />
          {/* Placeholder: the backend has no password-reset API yet. */}
          <div className="auth-row-end">
            <button type="button" className="link-button" disabled title="Coming soon">
              Forgot password?
            </button>
          </div>
        </div>

        {/* Sessions already persist through the refresh cookie, so this stays on. */}
        <label className="auth-checkbox" title="You stay signed in on this device">
          <input type="checkbox" defaultChecked disabled />
          Remember me
        </label>

        <button
          type="submit"
          className="auth-submit"
          disabled={signInLock.locked}
          aria-busy={submitting}
        >
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Logging in...
            </>
          ) : (
            <>
              Log in
              <ArrowRightIcon />
            </>
          )}
        </button>
      </form>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <GoogleSignIn
        text="continue_with"
        error={googleError}
        onError={showGoogleError}
        signInLock={signInLock}
      />

      {onCreateAccount && (
        <p className="auth-switch">
          Don&apos;t have an account?{" "}
          <button type="button" className="link-button strong" onClick={onCreateAccount}>
            Sign up
            <ArrowRightIcon />
          </button>
        </p>
      )}
    </section>
  );
}

