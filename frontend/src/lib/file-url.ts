/**
 * URL file dari backend sudah berbentuk `/api/v1/...` (bukan `/v1/...`).
 * Jangan menambahkan `/api` lagi — itu membuat path menjadi `/api/api/v1/...`.
 */
export function fileUrl(url?: string | null): string {
  if (!url) return "#";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  if (url.startsWith("/api/")) return url;
  if (url.startsWith("/api")) return `/${url.replace(/^\/+/, "")}`;
  return `/api${url.startsWith("/") ? url : `/${url}`}`;
}
