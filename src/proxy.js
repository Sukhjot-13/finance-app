// src/proxy.js
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Builds a strict Content-Security-Policy for page requests.
 * - script-src uses a per-request nonce + strict-dynamic: Next reads the
 *   nonce from the request CSP header and applies it to its hydration
 *   scripts; framework-injected chunks are trusted transitively.
 * - style-src keeps 'unsafe-inline' because Framer Motion/Chart.js tuning
 *   relies on inline styling.
 * - Dev additionally allows 'unsafe-eval' for HMR/Turbopack.
 * - connect-src AND script-src gain the Manager origin when it is configured:
 *   the browser logger and the analytics tracker both POST there, and 'self'
 *   alone would silently block them. Unset => unchanged policy, so the
 *   integration stays a no-op when it is not configured.
 *
 *   script-src: CSP3 browsers honour 'strict-dynamic' and IGNORE host sources,
 *   and the tracker tag is inserted by a nonce'd script, so it is trusted
 *   transitively. Browsers that do not implement 'strict-dynamic' (and therefore
 *   fall back to host allowlists) would block the tracker without the explicit
 *   origin, so it is listed for them.
 */
function buildCsp(nonce) {
  const isDev = process.env.NODE_ENV === "development";
  const managerOrigin = process.env.NEXT_PUBLIC_MANAGER_ENDPOINT
    ? ` ${process.env.NEXT_PUBLIC_MANAGER_ENDPOINT}`
    : "";
  return [
    "default-src 'self'",
    `script-src 'self'${managerOrigin} 'nonce-${nonce}' 'strict-dynamic'${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${managerOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Verifies the refresh-session cookie's JWT signature.
 *
 * The old gate only checked that a `refreshToken` cookie was PRESENT, which
 * made this the one default-allow page guard: `refreshToken=anything`
 * rendered /dashboard, /transactions and /profile. (No data leaked — every
 * API route independently calls verifySession() — but the page shell itself
 * was reachable.)
 *
 * Fails CLOSED on any error: a missing secret, a malformed token, a bad
 * signature, an expired token, or an unexpected algorithm all mean "not
 * authenticated".
 */
async function hasValidSession(token) {
  if (!token) return false;
  const secret = process.env.REFRESH_TOKEN_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Public paths must match EXACTLY or on a path-segment boundary. The old
 * `pathname.startsWith(p)` made /api-docs, /apifoo and /login-x public.
 */
const PUBLIC_PATHS = ["/login", "/api"];

function isPublicPath(pathname) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const refreshToken = request.cookies.get("refreshToken")?.value;
  const authenticated = await hasValidSession(refreshToken);

  // If the user is logged in (has a VERIFIED session) and tries to
  // access the login page, redirect them to the dashboard.
  // NOTE: /welcome is intentionally NOT bounced — a brand-new user lands
  // there straight after OTP verification (with cookies already set), and
  // bouncing them would break onboarding entirely. Anonymous visitors are
  // still redirected to /login by the publicPaths check below.
  if (authenticated && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // If the user is not logged in and is trying to access a protected route,
  // redirect them to the login page.
  if (!authenticated && !isPublicPath(pathname)) {
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
