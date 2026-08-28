import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-compatible only — cannot reach Prisma/argon2 here, so this is NOT the real auth
 * boundary (that's requireUser()/canAccessPath() in the (shell) layout, which run on the
 * Node runtime). This just forwards the current pathname as a header so the layout —
 * which has no other way to read the request path from a Server Component — can run its
 * real, server-side access check against it.
 */
export function middleware(request: NextRequest) {
  // Rewriting the REQUEST headers (not the response's) is what makes this readable via
  // headers() inside a Server Component further down the same request.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
