// Mirrors backend/resources/validators.py. The server is the real gatekeeper;
// these checks only give the user an instant answer before a slow upload.
const MB = 1024 * 1024;

export const MATERIAL_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.mp4";

const ALLOWED = new Set(MATERIAL_ACCEPT.split(","));
export const MAX_DOCUMENT_MB = 10;
export const MAX_VIDEO_MB = 100;

export type FileProblem =
  | { key: "file_type_not_allowed" }
  | { key: "file_empty" }
  | { key: "file_too_large_limit"; size: string; limit: number };

export function checkMaterialFile(file: File): FileProblem | null {
  const dot = file.name.lastIndexOf(".");
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!ALLOWED.has(extension)) return { key: "file_type_not_allowed" };
  if (file.size === 0) return { key: "file_empty" };
  const limit = extension === ".mp4" ? MAX_VIDEO_MB : MAX_DOCUMENT_MB;
  if (file.size > limit * MB) {
    return { key: "file_too_large_limit", size: (file.size / MB).toFixed(1), limit };
  }
  return null;
}

/** First readable message from a DRF error body ({"file": ["..."]}, {"detail": "..."}, ...). */
export function firstApiError(data: unknown): string | null {
  if (!data) return null;
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return firstApiError(data[0]);
  if (typeof data === "object") {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const found = firstApiError(value);
      if (found) return found;
    }
  }
  return null;
}
