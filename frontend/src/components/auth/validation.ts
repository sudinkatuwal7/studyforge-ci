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

// Mirrors Django's MinimumLengthValidator. The server also rejects common or all-number passwords.
export function validatePassword(value: string): string | undefined {
  if (!value) {
    return "Create a password.";
  }
  if (value.length < 8) {
    return "Use at least 8 characters.";
  }
  return undefined;
}

export function validatePasswordMatch(password: string, confirm: string): string | undefined {
  if (!confirm) {
    return "Re-enter your password.";
  }
  return password === confirm ? undefined : "Passwords don't match.";
}
