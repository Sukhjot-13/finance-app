// src/proxy.js
import { NextResponse } from "next/server";

/**
 * Builds a strict Content-Security-Policy for page requests.
 * - script-src uses a per-request nonce + strict-dynamic: Next reads the
 *   nonce from the request CSP header and applies it to its hydration
 *   scripts; framework-injected chunks are trusted transitively.
 * - style-src keeps 'unsafe-inline' because Framer Motion/Chart.js tuning
 *   relies on inline styling.
 * - Dev additionally allows 'unsafe-eval' for HMR/Turbopack.
 */
function buildCsp(nonce) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

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

  // API routes serve JSON only — skip CSP work there.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Per-request nonce for the Content-Security-Policy. Setting the CSP on
  // the REQUEST headers lets Next.js pick up the nonce and stamp it onto
  // its own inline bootstrap scripts automatically.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
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
