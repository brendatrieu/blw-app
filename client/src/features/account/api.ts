import { ACCOUNT_DELETE_CONFIRMATION, accountExportFilename } from "@blw/shared";
import { ApiError } from "../../lib/api.js";

/** Pulls the API's `{ error: "code" }` body out of a failed response. */
async function errorCode(response: Response): Promise<string> {
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const { error } = parsed as { error: unknown };
      if (typeof error === "string") return error;
    }
  } catch {
    // Non-JSON or empty error body — fall through to the status text.
  }
  return response.statusText || `Request failed with status ${response.status}`;
}

/**
 * The filename the server put on the attachment, so the saved file matches
 * what the API says it is. Falls back to the shared naming helper if the
 * header is missing or unparseable.
 */
function filenameFrom(response: Response): string {
  const header = response.headers.get("content-disposition");
  const match = header ? /filename="([^"]+)"/.exec(header) : null;
  return match?.[1] ?? accountExportFilename();
}

/**
 * Downloads the export bundle.
 *
 * Fetched rather than linked: the endpoint needs the session cookie and
 * returns an attachment, and going through `fetch` means a 401 or a 500
 * surfaces as an error in the UI instead of navigating the app away to a
 * raw error page.
 */
export async function downloadAccountExport(): Promise<void> {
  const response = await fetch("/api/account/export", {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await errorCode(response));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameFrom(response);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoking immediately after the synchronous click is safe and keeps the
    // blob from pinning the whole export in memory for the session.
    URL.revokeObjectURL(url);
  }
}

/**
 * Deletes the account. The password is sent once, in the body, and is never
 * stored anywhere on the client.
 *
 * `lib/api.ts`'s `apiDelete` sends no body, and this request needs one — the
 * same local-wrapper precedent as `features/ai/api.ts`.
 */
export async function deleteAccount(password: string): Promise<void> {
  const response = await fetch("/api/account", {
    method: "DELETE",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: ACCOUNT_DELETE_CONFIRMATION, password }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await errorCode(response));
  }
}
