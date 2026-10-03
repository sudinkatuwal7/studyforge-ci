// Read the backend address from frontend/.env instead of hard-coding it.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Keep the HTTP status so pages can explain errors such as 401 and 404.
export class ApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function request(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<Response> {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  const headers = new Headers(options.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}

export async function getJson<T>(path: string, accessToken?: string): Promise<T> {
  const response = await request(path, {}, accessToken);

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  return (await response.json()) as T;
}

// Send form data as JSON, using the same bearer-token format as GET requests.
export async function postJson<T>(
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  return (await response.json()) as T;
}
