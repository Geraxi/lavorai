import { NextResponse, type NextRequest } from "next/server";
import { analyzeOpportunity } from "@/lib/founder-coach/analyzer";
import { guardPremiumAPI } from "@/lib/premium-gate";
import type { OpportunityInput } from "@/lib/founder-coach/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const gate = await guardPremiumAPI("founder_coach");
  if (gate.error) return gate.error;

  let body: Partial<OpportunityInput>;
  try {
    body = (await request.json()) as Partial<OpportunityInput>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const input: OpportunityInput = {
    companyName: typeof body.companyName === "string" ? body.companyName.trim() : "",
    roleTitle: typeof body.roleTitle === "string" ? body.roleTitle.trim() : "",
    rawContext: typeof body.rawContext === "string" ? body.rawContext.trim() : "",
    companyUrl: typeof body.companyUrl === "string" ? body.companyUrl.trim() : undefined,
    cvSummary: typeof body.cvSummary === "string" ? body.cvSummary.trim() : undefined,
    personalGoal: typeof body.personalGoal === "string" ? body.personalGoal.trim() : undefined,
    constraints: body.constraints,
  };
  if (!input.companyName || !input.roleTitle || !input.rawContext) {
    return NextResponse.json(
      { error: "missing", message: "companyName, roleTitle e rawContext sono obbligatori." },
      { status: 400 },
    );
  }

  try {
    const analysis = await analyzeOpportunity(input);
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    console.error("[founder-coach] analyze failed", err);
    return NextResponse.json(
      { error: "ai_error", message: err instanceof Error ? err.message : "AI failure" },
      { status: 500 },
    );
  }
}
