import { API_BASE_URL, getJson } from "./client";

export type PublicUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
};

export type LoginResult = {
  access: string;
  user: PublicUser;
};

function getCsrfToken(): string | undefined {
  const cookie = document.cookie
    .split("; ")
    .find((part) => part.startsWith("csrftoken="));

  return cookie ? decodeURIComponent(cookie.split("=")[1]) : undefined;
}

export type AuthFieldErrors = Record<string, string[]>;

// "credentials": wrong email/password. "validation": the server rejected
// specific fields. "unavailable": network, CSRF, or server-side failure.
export class AuthError extends Error {
  readonly kind: "credentials" | "validation" | "unavailable";
  readonly fieldErrors: AuthFieldErrors;

  constructor(
    kind: AuthError["kind"],
    message: string,
    fieldErrors: AuthFieldErrors = {},
  ) {
    super(message);
    this.name = "AuthError";
    this.kind = kind;
    this.fieldErrors = fieldErrors;
  }
}

const UNAVAILABLE_MESSAGE =
  "We couldn't reach StudyForge. Check your connection and try again.";
const SERVER_ERROR_MESSAGE = "Something went wrong on our side. Please try again.";

// fetch() rejects only when the request never got a response (offline, CORS, server down).
async function sendAuthRequest(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new AuthError("unavailable", UNAVAILABLE_MESSAGE);
  }
}

// DRF returns 400 bodies like {"email": ["..."], "password": ["...", "..."]}.
function toFieldErrors(body: unknown): AuthFieldErrors {
  if (typeof body !== "object" || body === null) {
    return {};
  }

  const errors: AuthFieldErrors = {};
  for (const [field, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      errors[field] = value.map(String);
    } else if (typeof value === "string") {
      errors[field] = [value];
    }
  }
  return errors;
}
export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  const csrfResponse = await sendAuthRequest(`${API_BASE_URL}/auth/csrf/`, {
    credentials: "include",
  });

  const csrfToken = csrfResponse.ok ? getCsrfToken() : undefined;
  if (!csrfToken) {
    throw new AuthError("unavailable", SERVER_ERROR_MESSAGE);
  }

  const response = await sendAuthRequest(`${API_BASE_URL}/auth/token/`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken,
    },
    body: JSON.stringify({ email, password }),
  });

  // 400 = missing field, 401 = wrong email or password. Same message for both
  // so the page never reveals whether an email has an account.
  if (response.status === 400 || response.status === 401) {
    throw new AuthError("credentials", "Incorrect email or password.");
  }

  if (!response.ok) {
    throw new AuthError("unavailable", SERVER_ERROR_MESSAGE);
  }

  return (await response.json()) as LoginResult;
}

const GOOGLE_FAILED_MESSAGE = "Google sign-in failed. Please try again.";
// These match the backend's responses, so the page knows which one it got.
const DEACTIVATED_MESSAGE = "This account has been deactivated.";
const EMAIL_TAKEN_MESSAGE = "An account with this email already exists.";
const GOOGLE_UNAVAILABLE_MESSAGE = "Google sign-in is not available right now.";

// Signs in with the ID token from Google's button. A first sign-in creates the
// account, so this is both "log in" and "sign up".
export async function loginWithGoogle(credential: string): Promise<LoginResult> {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  const csrfResponse = await sendAuthRequest(`${API_BASE_URL}/auth/csrf/`, {
    credentials: "include",
  });

  const csrfToken = csrfResponse.ok ? getCsrfToken() : undefined;
  if (!csrfToken) {
    throw new AuthError("unavailable", SERVER_ERROR_MESSAGE);
  }

  const response = await sendAuthRequest(`${API_BASE_URL}/auth/google/`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken,
    },
    body: JSON.stringify({ credential }),
  });

  if (response.ok) {
    return (await response.json()) as LoginResult;
  }

  switch (response.status) {
    case 400:
    case 401:
      throw new AuthError("credentials", GOOGLE_FAILED_MESSAGE);
    case 403: {
      // A failed CSRF check is also a 403, so check which one this is.
      const body: unknown = await response.json().catch(() => ({}));
      if (toFieldErrors(body).detail?.[0] === DEACTIVATED_MESSAGE) {
        throw new AuthError("credentials", DEACTIVATED_MESSAGE);
      }
      throw new AuthError("unavailable", SERVER_ERROR_MESSAGE);
    }
    case 409:
      throw new AuthError("credentials", EMAIL_TAKEN_MESSAGE);
    case 503:
      throw new AuthError("unavailable", GOOGLE_UNAVAILABLE_MESSAGE);
    default:
      throw new AuthError("unavailable", SERVER_ERROR_MESSAGE);
  }
}

// Refresh tokens are single-use, so tabs take turns refreshing. A tab that waited
// then sends the newest cookie instead of one another tab just used up.
const REFRESH_LOCK = "studyforge-refresh";

export function refreshAccessToken(): Promise<string> {
  // jsdom and older browsers have no Web Locks API, so refresh without one.
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(REFRESH_LOCK, requestAccessToken);
  }
  return requestAccessToken();
}

async function requestAccessToken(): Promise<string> {

  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  const csrfResponse = await fetch(`${API_BASE_URL}/auth/csrf/`, {
    credentials: "include",
  });

  if (!csrfResponse.ok) {
    throw new Error(`CSRF setup failed: ${csrfResponse.status}`);
  }

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    throw new Error("CSRF cookie was not set");
  }

  const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken,
    },
    body: "{}",
  });

  if (!response.ok) {
   if (response.status === 401) {
    throw new RefreshRejectedError("Session expired. Please sign in again.");
   }
   throw new Error(`Refresh failed: ${response.status}`);
 }

  const { access } = (await response.json()) as { access: string };
  return access;
}

// AuthContext passes its shared refresh so a double-run effect sends one request.
export async function restoreSession(
  refresh: () => Promise<string> = refreshAccessToken,
): Promise<LoginResult> {
  const access = await refresh();

  const { user } = await getJson<{ user: PublicUser }>("/auth/me/", access);
  return { access, user };
}
export async function logout(): Promise<void> {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  const csrfResponse = await fetch(`${API_BASE_URL}/auth/csrf/`, {
    credentials: "include",
  });

  if (!csrfResponse.ok) {
    throw new Error(`CSRF setup failed: ${csrfResponse.status}`);
  }

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    throw new Error("CSRF cookie was not set");
  }

  const response = await fetch(`${API_BASE_URL}/auth/logout/`, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-CSRFToken": csrfToken,
    },
  });

  if (!response.ok) {
  throw new Error(`Logout failed: ${response.status}`);
  }
}
export class RefreshRejectedError extends Error {}

// How long an access token is valid, from its own "iat" and "exp" claims. Both
// come from the server's clock, so a wrong clock on this computer does not matter.
// Returns null for anything that is not a readable JWT.
export function accessTokenLifetimeMs(token: string): number | null {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp, iat } = JSON.parse(atob(payload)) as { exp?: unknown; iat?: unknown };
    if (typeof exp !== "number" || typeof iat !== "number" || exp <= iat) return null;
    return (exp - iat) * 1000;
  } catch {
    return null;
  }
}
export type RegisterInput = {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
};

// Creates the account only. The caller signs in afterwards with login().
export async function register(input: RegisterInput): Promise<PublicUser> {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  const response = await sendAuthRequest(`${API_BASE_URL}/auth/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => ({}));
    throw new AuthError(
      "validation",
      "Please fix the highlighted fields.",
      toFieldErrors(body),
    );
  }

  if (!response.ok) {
    throw new AuthError("unavailable", SERVER_ERROR_MESSAGE);
  }

  const { user } = (await response.json()) as { user: PublicUser };
  return user;
}
