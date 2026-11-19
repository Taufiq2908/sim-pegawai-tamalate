import { NextRequest, NextResponse } from "next/server";
import { stripAuthTokens } from "@/lib/auth-payload";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
const ACCESS_COOKIE = "simpeg_access";
const REFRESH_COOKIE = "simpeg_refresh";

const PASS_THROUGH_HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
  "accept-ranges",
  "etag",
  "last-modified",
];

function backendUrl(path: string[], search: string) {
  // URL file dari backend sudah berbentuk `/api/v1/...`. Route handler ini
  // sudah berada di bawah `/api`, jadi buang prefix `v1` agar tidak menjadi
  // `/api/v1/v1/...` saat diteruskan ke backend.
  let parts = path;
  if (parts[0] === "api") parts = parts.slice(1);
  if (parts[0] === "v1") parts = parts.slice(1);
  const clean = parts.map(encodeURIComponent).join("/");
  return `${BACKEND}/${clean}${search ? `?${search}` : ""}`;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

/** Pangkas token dari body JSON; buffer asli dikembalikan bila tidak bisa diparse. */
function stripTokensFromBuffer(buffer: Buffer<ArrayBuffer>): Buffer<ArrayBuffer> {
  try {
    const json: unknown = JSON.parse(buffer.toString("utf8"));
    const stripped = stripAuthTokens(json);
    if (stripped === json) return buffer;
    return Buffer.from(JSON.stringify(stripped), "utf8");
  } catch {
    return buffer;
  }
}

async function refreshSession(
  refreshToken: string,
  forwardedFor?: string,
): Promise<{
  accessToken?: string;
  refreshToken?: string;
} | null> {
  try {
    const res = await fetch(`${BACKEND}/auth/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | { data?: { accessToken?: string; refreshToken?: string } }
      | null;
    if (!json?.data?.accessToken) return null;
    return json.data;
  } catch {
    return null;
  }
}

async function forward(req: NextRequest, path: string[]) {
  const pathKey = path.join("/");
  const url = backendUrl(path, new URL(req.url).searchParams.toString());
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  // Teruskan content-type asli (JSON atau multipart boundary).
  if (contentType) headers["content-type"] = contentType;
  if (access) headers.authorization = `Bearer ${access}`;
  // Teruskan apa adanya (tidak membuat/menambah nilai): backend butuh IP klien
  // asli untuk trust proxy + rate limit.
  const forwardedFor = req.headers.get("x-forwarded-for") ?? undefined;
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  async function send(): Promise<Response> {
    return fetch(url, { method: req.method, headers, body, cache: "no-store" });
  }

  let res: Response;
  try {
    res = await send();
  } catch {
    return NextResponse.json(
      { success: false, message: "Backend tidak terjangkau", data: null, meta: null, errors: null },
      { status: 502 },
    );
  }

  let newAccess: string | undefined;
  let newRefresh: string | undefined;
  let refreshed = false;
  let refreshFailed = false;
  const skipRefresh =
    pathKey === "auth/login" || pathKey === "auth/refresh" || pathKey === "auth/logout";

  // Access token 15 menit. Coba refresh sekali, lalu ulangi request asli.
  // `/auth/me` juga harus bisa memulihkan sesi. Hanya login/refresh/logout
  // yang tidak boleh memicu refresh agar tidak terjadi loop.
  if (res.status === 401 && refresh && !skipRefresh) {
    const session = await refreshSession(refresh, forwardedFor);
    if (session?.accessToken) {
      refreshed = true;
      newAccess = session.accessToken;
      newRefresh = session.refreshToken;
      headers.authorization = `Bearer ${newAccess}`;
      try {
        res = await send();
      } catch {
        return NextResponse.json(
          { success: false, message: "Backend tidak terjangkau", data: null, meta: null, errors: null },
          { status: 502 },
        );
      }
      if (res.status === 401) refreshFailed = true;
    } else {
      refreshFailed = true;
    }
  } else if (res.status === 401 && !skipRefresh) {
    refreshFailed = true;
  }

  // Baca sebagai byte agar PDF/foto tidak rusak oleh res.text().
  const buffer = Buffer.from(await res.arrayBuffer());

  // Tangkap token login dari body ASLI sebelum dipangkas; cookie di-set dari nilai ini.
  if (pathKey === "auth/login" && res.ok) {
    try {
      const json = JSON.parse(buffer.toString("utf8")) as {
        data?: { accessToken?: string; refreshToken?: string };
      };
      newAccess = json?.data?.accessToken;
      newRefresh = json?.data?.refreshToken;
    } catch {
      /* abaikan */
    }
  }

  // Login/refresh sukses: token tidak boleh ikut ke browser. Bila parse gagal
  // atau status bukan 2xx, respons diteruskan apa adanya.
  const responseBody =
    res.ok && (pathKey === "auth/login" || pathKey === "auth/refresh")
      ? stripTokensFromBuffer(buffer)
      : buffer;

  const responseHeaders: Record<string, string> = {};
  for (const name of PASS_THROUGH_HEADERS) {
    const value = res.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  if (responseBody.length) responseHeaders["content-length"] = String(responseBody.byteLength);
  if (!responseHeaders["content-type"]) {
    responseHeaders["content-type"] = "application/json";
  }

  const response = new NextResponse(responseBody.length ? responseBody : null, {
    status: res.status,
    headers: responseHeaders,
  });

  if (newAccess) {
    response.cookies.set(ACCESS_COOKIE, newAccess, cookieOptions(15 * 60));
  }
  if (newRefresh) {
    response.cookies.set(REFRESH_COOKIE, newRefresh, cookieOptions(7 * 24 * 3600));
  }
  if (refreshFailed) {
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
  }

  // Logout selalu membersihkan sesi lokal, walau backend tidak menjawab sukses.
  if (pathKey === "auth/logout") {
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
  }

  // Tidak perlu header debug di produksi; ini membantu memastikan retry terjadi.
  if (refreshed) response.headers.set("x-simpeg-refreshed", "1");

  return response;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
