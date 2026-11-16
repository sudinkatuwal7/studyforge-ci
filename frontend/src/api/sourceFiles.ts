import { request } from "./client";
import { DocumentRequestError } from "./documents";

// The API authenticates with a bearer token, so a plain link cannot open a source:
// the file is fetched with the token and handed to the browser as a blob.
export async function fetchSourceFile(documentId: number, token: string, signal?: AbortSignal): Promise<Blob> {
  const response = await request(`/documents/${documentId}/file/`, { signal, cache: "no-store" }, token);
  if (!response.ok) throw new DocumentRequestError(response.status, await response.json().catch(() => null));
  return response.blob();
}
