import { API_BASE_URL } from "./client";

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

export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
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

  const response = await fetch(`${API_BASE_URL}/auth/token/`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  return (await response.json()) as LoginResult;
}