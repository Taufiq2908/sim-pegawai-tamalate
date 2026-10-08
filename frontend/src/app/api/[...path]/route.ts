import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
const ACCESS_COOKIE = "simpeg_access";
const REFRESH_COOKIE = "simpeg_refresh";

function backendUrl(path: string[], search: string) {
  const clean = path.map(encodeURIComponent).join("/");
  return `${BACKEND}/${clean}${search ? `?${search}` : ""}`;
}

async function forward(req: NextRequest, path: string[]) {
  const url = backendUrl(path, new URL(req.url).searchParams.toString());
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  // Teruskan content-type asli (JSON atau multipart boundary).
  if (contentType) headers["content-type"] = contentType;
  if (access) headers.authorization = `Bearer ${access}`;

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  let res: Response;
  try {
    res = await fetch(url, { method: req.method, headers, body });
  } catch {
    return NextResponse.json(
      { success: false, message: "Backend tidak terjangkau", data: null, meta: null, errors: null },
      { status: 502 },
    );
  }

  const text = await res.text();
  const response = new NextResponse(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });

  // Tangkap token dari /auth/login & /auth/refresh ke httpOnly cookie.
  if (path.join("/") === "auth/login" && res.ok) {
    try {
      const json = JSON.parse(text);
      const accessToken: string | undefined = json?.data?.accessToken;
      const refreshToken: string | undefined = json?.data?.refreshToken;
      if (accessToken) {
        response.cookies.set(ACCESS_COOKIE, accessToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 15 * 60,
        });
      }
      if (refreshToken) {
        response.cookies.set(REFRESH_COOKIE, refreshToken, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 7 * 24 * 3600,
        });
      }
    } catch {
      /* abaikan */
    }
  }
  return response;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const path = (await ctx.params).path;
  // Logout: bersihkan cookie lebih dulu.
  if (path.join("/") === "auth/logout") {
    const res = await forward(req, path);
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }
  return forward(req, path);
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
