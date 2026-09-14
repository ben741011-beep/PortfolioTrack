import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const privatePaths = [
  "/inventory",
  "/transactions",
  "/dividends",
  "/family",
  "/us-inventory",
];

export function proxy(request: NextRequest) {
  const isPrivatePath = privatePaths.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`),
  );

  if (isPrivatePath && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/inventory/:path*",
    "/transactions/:path*",
    "/dividends/:path*",
    "/family/:path*",
    "/us-inventory/:path*",
  ],
};
