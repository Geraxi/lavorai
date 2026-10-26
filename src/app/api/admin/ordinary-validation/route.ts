import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { isAdmin } from '@/lib/admin';
import { checkOrigin } from '@/lib/csrf';
import { ordinaryValidationConfig, ordinaryValidationRow } from '@/lib/ordinary-validation';
import { prisma } from '@/lib/db';
import { processApplication } from '@/lib/application-worker';
export const runtime='nodejs';
export const maxDuration=300;

/** Runs only an already provisioned fresh ordinary row. Never creates/reset jobs,
 * modifies a profile, consents, quota, email route, or sends diagnostic tokens.
 * Concurrent requests meet the ordinary row/lease/budget fences.
 */
export async function POST(request: NextRequest) {
  const user=await getCurrentUser();
  if (!isAdmin(user?.email) || !checkOrigin(request)) return NextResponse.json({error:'forbidden'},{status:403});
  const config=ordinaryValidationConfig();
  if (!config) return NextResponse.json({error:'validation_closed'},{status:409});
  const body=await request.json().catch(()=>null);
  if (!body || Object.keys(body).length!==1 || body.applicationId!==config.id) return NextResponse.json({error:'invalid_request'},{status:400});
  if (body.applicationId === 'ordinary_validation_produzioneweb_20261026') return NextResponse.json({error:'use_owner_flow_with_recipient_verification'},{status:409});
  const app=await prisma.application.findUnique({where:{id:config.id},include:{job:true,user:true}});
  if (!app || !ordinaryValidationRow(app) || app.status!=='queued' || app.startedAt || app.leaseToken
    || app.submitStartedAt || app.submittedAt || app.submittedVia || app.submitConfirmation || app.retryCount>0)
    return NextResponse.json({error:'not_fresh_or_already_attempted'},{status:409});
  // No forceRealSubmit, synthetic auth token, gate overlay or queue publication.
  await processApplication(app.id);
  const result=await prisma.application.findUnique({where:{id:app.id},select:{id:true,status:true,submitConfirmation:true,submittedVia:true,submittedAt:true,submissionReceiptJson:true,sendStatus:true,sendFailureReason:true,errorMessage:true}});
  return NextResponse.json({result});
}
