// Client-side fetch wrapper. Semua request ke backend lewat
// Next Route Handler /api/[...path] (same-origin) agar token
// httpOnly tidak terekspos ke JS.

export interface ApiError extends Error {
  status: number;
  errors?: Record<string, string[]> | null;
}

/** Sesi habis setelah proxy gagal refresh: kembali ke login tanpa kehilangan tujuan. */
function redirectToLogin(status: number, path: string) {
  if (typeof window === "undefined" || status !== 401) return;
  if (path.startsWith("/auth/")) return;
  if (window.location.pathname === "/login") return;

  const next = `${window.location.pathname}${window.location.search}`;
  const params = new URLSearchParams({ reason: "expired" });
  if (next && next !== "/") params.set("next", next);
  window.location.assign(`/login?${params.toString()}`);
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; meta: unknown | null; raw: unknown }> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    credentials: "same-origin",
  });

  let body: {
    success: boolean;
    message: string;
    data: T;
    meta: unknown | null;
    errors: Record<string, string[]> | null;
  } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || !body || body.success === false) {
    const err = new Error(
      body?.message ?? `Permintaan gagal (${res.status})`,
    ) as ApiError;
    err.status = res.status;
    err.errors = body?.errors ?? null;
    redirectToLogin(res.status, path);
    throw err;
  }
  return { data: body.data, meta: body.meta, raw: body };
}

/** Pesan seragam untuk aksi cuti yang hanya boleh dilakukan pemilik pengajuan. */
export function ownerActionMessage(err: unknown, fallback: string): string {
  if ((err as { status?: number } | null)?.status === 403) {
    return "Hanya pemilik pengajuan yang dapat melakukan aksi ini.";
  }
  return err instanceof Error ? err.message : fallback;
}

/** Upload multipart (dokumen cuti/KGB/surat) lewat proxy yang sama. */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  method = "POST",
): Promise<{ data: T; meta: unknown | null }> {
  const res = await fetch(`/api${path}`, {
    method,
    body: form,
    credentials: "same-origin",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) {
    const err = new Error(
      body?.message ?? `Unggah gagal (${res.status})`,
    ) as ApiError;
    err.status = res.status;
    err.errors = body?.errors ?? null;
    redirectToLogin(res.status, path);
    throw err;
  }
  return { data: body.data, meta: body.meta };
}
