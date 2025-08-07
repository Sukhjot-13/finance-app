// src/middleware.js
import { NextResponse } from "next/server";

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const refreshToken = request.cookies.get("refreshToken")?.value;

  // If the user is logged in (has a refresh token) and tries to
  // access the login or welcome page, redirect them to the dashboard.
  if (refreshToken && (pathname === "/login" || pathname === "/welcome")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Define public paths that don't require authentication
  const publicPaths = [
    "/login",
    "/welcome",
    "/api/auth/otp/send",
    "/api/auth/otp/verify",
    "/api/auth/refresh",
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
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
