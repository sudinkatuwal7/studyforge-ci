// Client-side checks give instant feedback. The backend still validates everything.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();

  if (!email) {
    return "Enter your email address.";
  }
  if (!EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address, like name@example.com.";
  }
  return undefined;
}

export function validateRequired(value: string, message: string): string | undefined {
  return value ? undefined : message;
}
