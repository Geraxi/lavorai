import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/session";
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ error: "trials_retired", message: "Le nuove prove sono state sostituite dal piano Free. Le prove esistenti mantengono la loro scadenza." }, { status: 410 });
}
