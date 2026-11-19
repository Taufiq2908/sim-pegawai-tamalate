/**
 * Buang token dari body respons login/refresh. Token tetap dipakai untuk cookie
 * httpOnly di route handler, tetapi tidak boleh ikut terkirim ke browser.
 * Fungsi murni supaya mudah diuji; input aneh dikembalikan apa adanya.
 */
export function stripAuthTokens(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;

  const payload = json as Record<string, unknown>;
  const data = payload.data;
  if (!data || typeof data !== "object") return json;

  const rest = { ...(data as Record<string, unknown>) };
  delete rest.accessToken;
  delete rest.refreshToken;
  return { ...payload, data: rest };
}
