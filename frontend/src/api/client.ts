export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
