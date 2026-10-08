// Tanda tangan elektronik DUMMY fase 1.
// Disimpan di localStorage per username (satu browser). Versi produksi butuh
// endpoint aset backend (docs/06 B11). Jangan dianggap TTE tersertifikasi.

const KEY = (username: string) => `simpeg_sig_${username.toLowerCase()}`;

export function loadSignature(username: string | null | undefined): string | null {
  if (!username || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY(username));
  } catch {
    return null;
  }
}

export function saveSignature(username: string, dataUrl: string) {
  window.localStorage.setItem(KEY(username), dataUrl);
}

export function clearSignature(username: string) {
  window.localStorage.removeItem(KEY(username));
}
