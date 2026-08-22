// src/proxy.js
import { NextResponse } from "next/server";

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const refreshToken = request.cookies.get("refreshToken")?.value;

  // If the user is logged in (has a refresh token) and tries to
  // access the login page, redirect them to the dashboard.
  // NOTE: /welcome is intentionally NOT bounced — a brand-new user lands
  // there straight after OTP verification (with cookies already set), and
  // bouncing them would break onboarding entirely. Anonymous visitors are
  // still redirected to /login by the publicPaths check below.
  if (refreshToken && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Define public paths that don't require authentication
  // All /api routes are excluded — they handle their own auth (return 401 when unauthenticated).
  const publicPaths = [
    "/login",
    "/api",
  ];

  // If the user is not logged in and is trying to access a protected route,
  // redirect them to the login page.
  if (!refreshToken && !publicPaths.some((path) => pathname.startsWith(path))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Otherwise, allow the request to proceed.
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - any file with an extension (public/ assets like /a.svg, images)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)",
  ],
};
