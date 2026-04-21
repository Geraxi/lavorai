import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware semplice: route protette richiedono una sessione next-auth.
 * In dev: se NEXTAUTH non è configurata (AUTH_SECRET mancante), bypassa
 *  così il demo user continua a funzionare.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/applications",
  "/cv",
  "/preferences",
  "/analytics",
  "/inbox",
  "/settings",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  // In dev, bypassa sempre il middleware: il demo user prende il posto
  // della sessione vera. In produzione, si deve passare per /login.
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  // Session cookie di next-auth v5
  const token =
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/applications/:path*",
    "/cv/:path*",
    "/preferences/:path*",
    "/analytics/:path*",
    "/inbox/:path*",
    "/settings/:path*",
  ],
};
