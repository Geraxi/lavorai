/**
 * Test-only auth endpoint for automated screenshot capture
 * ONLY works in development/test environments
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { SignJWT } from "jose";

export async function POST(request: Request) {
  // Safety check: only in development/test
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const { email } = await request.json();
  
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Create session token (mimicking NextAuth)
  const secret = new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET || "test-secret-key-for-local-development-only"
  );

  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  // Set session cookie
  const cookieStore = await cookies();
  cookieStore.set("next-auth.session-token", token, {
    httpOnly: true,
    secure: false, // http in development
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });

  return NextResponse.json({ success: true, user: { id: user.id, email: user.email } });
}
