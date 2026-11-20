import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AuthError,
  InvalidPasswordResetLinkError,
  confirmPasswordReset,
  validatePasswordResetLink,
} from "../api/auth";
import FormField from "../components/auth/FormField";
import { ArrowRightIcon, EyeIcon, EyeOffIcon, LockIcon } from "../components/auth/icons";
import { validatePassword, validatePasswordMatch } from "../components/auth/validation";
import { useAuth } from "../context/AuthContext";

type ResetStatus = "checking" | "valid" | "invalid" | "unavailable" | "complete";

export default function ResetPasswordPage({ uid, token }: { uid?: string; token?: string }) {
  const [status, setStatus] = useState<ResetStatus>(uid && token ? "checking" : "invalid");
  const [retryKey, setRetryKey] = useState(0);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ password: false, confirmPassword: false });
  const [serverPasswordError, setServerPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (!uid || !token) return;
    let cancelled = false;
    validatePasswordResetLink(uid, token).then(
      (valid) => { if (!cancelled) setStatus(valid ? "valid" : "invalid"); },
      () => { if (!cancelled) setStatus("unavailable"); },
    );
    return () => { cancelled = true; };
  }, [uid, token, retryKey]);

  const passwordError = (touched.password ? validatePassword(password) : undefined) ?? serverPasswordError;
  const confirmError = touched.confirmPassword
    ? validatePasswordMatch(password, confirmPassword)
    : undefined;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !uid || !token) return;
    setTouched({ password: true, confirmPassword: true });
    setFormError("");
    setServerPasswordError("");

    if (validatePassword(password)) {
      passwordRef.current?.focus();
      return;
    }
    if (validatePasswordMatch(password, confirmPassword)) {
      confirmRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(uid, token, password);
      setPassword("");
      setConfirmPassword("");
      if (user) await signOut();
      setStatus("complete");
    } catch (error) {
      if (error instanceof InvalidPasswordResetLinkError) {
        setPassword("");
        setConfirmPassword("");
        setStatus("invalid");
      } else if (error instanceof AuthError && error.kind === "validation") {
        const passwordMessage = error.fieldErrors.new_password?.join(" ");
        setServerPasswordError(passwordMessage || "Please choose another password.");
        passwordRef.current?.focus();
      } else {
        setFormError(error instanceof AuthError ? error.message : "We couldn't reset your password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="reset-password-heading">
      <h2 id="reset-password-heading" className="auth-card-title">Set a new password</h2>
      {status === "checking" && <p className="auth-notice" role="status">Checking your reset link...</p>}
      {status === "invalid" && (
        <>
          <p className="auth-alert" role="alert">This reset link is invalid, expired, or has already been used.</p>
          <p className="auth-switch"><Link to="/forgot-password" className="link-button strong">Request another reset link</Link></p>
        </>
      )}
      {status === "unavailable" && (
        <>
          <p className="auth-alert" role="alert">We couldn&apos;t check your link. Please try again.</p>
          <button type="button" className="link-button" onClick={() => {
            setStatus("checking");
            setRetryKey((value) => value + 1);
          }}>Try again</button>
          <p className="auth-switch"><Link to="/forgot-password" className="link-button strong">Request another reset link</Link></p>
        </>
      )}
      {status === "valid" && (
        <>
          <p className="auth-subtitle">Choose a new password for your StudyForge account.</p>
          <form className="auth-form" noValidate onSubmit={handleSubmit}>
            {formError && <p className="auth-alert" role="alert">{formError}</p>}
            <FormField
              ref={passwordRef}
              id="reset-new-password"
              label="New password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              icon={<LockIcon />}
              hint="At least 8 characters. Avoid common words or only numbers."
              value={password}
              error={passwordError}
              onChange={(event) => { setPassword(event.target.value); setServerPasswordError(""); }}
              onBlur={() => setTouched((current) => ({ ...current, password: true }))}
              trailing={
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                  aria-controls="reset-new-password reset-confirm-password"
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              }
            />
            <FormField
              ref={confirmRef}
              id="reset-confirm-password"
              label="Confirm new password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              icon={<LockIcon />}
              value={confirmPassword}
              error={confirmError}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, confirmPassword: true }))}
            />
            <button type="submit" className="auth-submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Saving password..." : <>Save new password<ArrowRightIcon /></>}
            </button>
          </form>
        </>
      )}
      {status === "complete" && (
        <>
          <p className="auth-notice" role="status">Your password has been reset.</p>
          <p className="auth-subtitle">
            Please log in with your new password. If the confirmation email does not arrive,
            your password change still took effect.
          </p>
          <p className="auth-switch"><Link to="/login" className="link-button strong">Log in</Link></p>
        </>
      )}
    </section>
  );
}
