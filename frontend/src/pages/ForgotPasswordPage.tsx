import { type SubmitEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AuthError, requestPasswordReset } from "../api/auth";
import FormField from "../components/auth/FormField";
import { ArrowRightIcon, MailIcon } from "../components/auth/icons";
import { validateEmail } from "../components/auth/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState("");
  const [serverEmailError, setServerEmailError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const emailError = (touched ? validateEmail(email) : undefined) ?? serverEmailError;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setTouched(true);
    setFormError("");
    setServerEmailError("");
    if (validateEmail(email)) {
      emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (error) {
      if (error instanceof AuthError && error.kind === "validation") {
        setServerEmailError(error.fieldErrors.email?.join(" ") || error.message);
        emailRef.current?.focus();
      } else {
        setFormError(
          error instanceof AuthError ? error.message : "We couldn't send your request. Please try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="forgot-password-heading">
      <h2 id="forgot-password-heading" className="auth-card-title">Reset your password</h2>
      {sent ? (
        <>
          <p className="auth-notice" role="status">
            If an eligible account exists, a reset link may arrive at its registered email address shortly.
          </p>
          <p className="auth-subtitle">
            If no email arrives, check your spam folder and try again later. Repeated requests are limited.
            Any link you receive expires in 60 minutes.
          </p>
          <button type="button" className="link-button strong" onClick={() => setSent(false)}>
            Request another link
          </button>
        </>
      ) : (
        <>
          <p className="auth-subtitle">Enter your email address and we&apos;ll send a reset link if the account is eligible.</p>
          <form className="auth-form" noValidate onSubmit={handleSubmit}>
            {formError && <p className="auth-alert" role="alert">{formError}</p>}
            <FormField
              ref={emailRef}
              id="reset-request-email"
              label="Email address"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              icon={<MailIcon />}
              value={email}
              error={emailError}
              onChange={(event) => {
                setEmail(event.target.value);
                setServerEmailError("");
              }}
              onBlur={() => setTouched(true)}
            />
            <button type="submit" className="auth-submit" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Sending link..." : <>Send reset link<ArrowRightIcon /></>}
            </button>
          </form>
        </>
      )}
      <p className="auth-switch"><Link to="/login" className="link-button strong">Back to log in</Link></p>
    </section>
  );
}
