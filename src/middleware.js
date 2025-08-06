// FILE: src/middleware.js
// ** THIS IS THE CORRECTED FILE **
// Uses 'jose' library which is compatible with the Next.js Edge Runtime.

import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("accessToken")?.value;

  // Define paths that do not require authentication
  const publicPaths = ["/login", "/api/auth/otp/send", "/api/auth/otp/verify"];

  // Allow requests to public paths to proceed without a token
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // If there's no token for a protected route, redirect to login
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Verify the token for protected routes using 'jose'
  try {
    // The secret key must be converted to a Uint8Array for 'jose'
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);

    // jwtVerify will throw an error if the token is invalid
    await jwtVerify(token, secret);

    // Token is valid, allow the request to proceed
    return NextResponse.next();
  } catch (error) {
    // This block catches invalid tokens (e.g., signature mismatch, expired)
    console.error("Middleware JWT Verification failed:", error.message);
    const url = request.nextUrl.clone();
    url.pathname = "/login";

    // Create a response to redirect and clear the invalid cookie
    const response = NextResponse.redirect(url);
    response.cookies.delete("accessToken");

    return response;
  }
}

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
