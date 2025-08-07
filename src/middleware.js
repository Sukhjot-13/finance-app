// src/middleware.js
import { NextResponse } from "next/server";

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  // Correctly access cookies from the request object in middleware
  const refreshToken = request.cookies.get("refreshToken")?.value;

  // Define public paths that don't require authentication
  const publicPaths = [
    "/login",
    "/welcome",
    "/api/auth/otp/send",
    "/api/auth/otp/verify",
    "/api/auth/refresh",
  ];

  // Allow requests to public paths and API routes under /api/auth
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    console.log("[MIDDLEWARE] Public path detected.");
    return NextResponse.next();
  }

  // If there's no refresh token, redirect to login for protected routes
  if (!refreshToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If the refresh token exists, let the request proceed.
  // The actual access token validation/refresh will happen in the API routes
  // or via the client-side api helper.
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
