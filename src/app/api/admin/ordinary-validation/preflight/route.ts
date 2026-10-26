import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { isAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { ordinaryValidationPreflight } from '@/lib/ordinary-validation-preflight';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) return NextResponse.json({error:'forbidden'}, {status:403});
  if (request.nextUrl.search) return NextResponse.json({error:'scope_is_fixed'}, {status:400});
  const result = await ordinaryValidationPreflight(prisma);
  return NextResponse.json(result, {headers:{'Cache-Control':'private, no-store'}});
}
