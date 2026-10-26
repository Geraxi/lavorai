import {NextRequest,NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/session';
import {isAdmin} from '@/lib/admin';
import {checkOrigin} from '@/lib/csrf';
import {prisma} from '@/lib/db';
import {MAIN_VALIDATION_USER,MAIN_VALIDATION_EMAIL} from '@/lib/ordinary-main-validation-scope';
import {mainOwnerState,prepareMainApplication,verifyMainRecipient,closeMainInvocation,claimMainInvocation,MainOwnerError,MAIN_VALIDATION_APP} from '@/lib/ordinary-main-validation-owner';
import {processApplication} from '@/lib/application-worker';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function owner(){const u=await getCurrentUser();return u?.id===MAIN_VALIDATION_USER&&u.email===MAIN_VALIDATION_EMAIL&&isAdmin(u.email)?u:null;}
export async function GET(request:NextRequest){if(!await owner())return json({error:'exact_owner_session_required'},403);if(request.nextUrl.search)return json({error:'scope_is_fixed'},400);return json(await mainOwnerState(prisma));}
export async function POST(request:NextRequest){
 if(!await owner()||!checkOrigin(request))return json({error:'forbidden'},403);
 const raw=await request.text();if(raw.length>2048)return json({error:'body_too_large'},400);
 let b:any;try{b=JSON.parse(raw);}catch{return json({error:'invalid_json'},400);}
 const fields:Record<string,string[]>={prepare:['action','cvId','cvHash','confirmCurrentRealCV'],verify:['action','recipient','evidence','ownsAndReceives'],run:['action','confirmOneSubmission'],close:['action']};
 if(!b||!Object.hasOwn(fields,b.action)||Object.keys(b).some(k=>!fields[b.action].includes(k)))return json({error:'invalid_request'},400);
 try{
  if(b.action==='prepare'){if(b.confirmCurrentRealCV!==true||typeof b.cvId!=='string'||typeof b.cvHash!=='string')return json({error:'confirm_current_real_cv_required'},400);return json(await prepareMainApplication(prisma,b.cvId,b.cvHash));}
  if(b.action==='verify'){if(b.ownsAndReceives!==true||typeof b.recipient!=='string'||typeof b.evidence!=='string')return json({error:'explicit_receiving_evidence_required'},400);return json(await verifyMainRecipient(prisma,b.recipient,b.evidence));}
  if(b.action==='close')return json(await closeMainInvocation(prisma));
  if(b.confirmOneSubmission!==true)return json({error:'explicit_single_submit_required'},400);
  await claimMainInvocation(prisma);
  try{await processApplication(MAIN_VALIDATION_APP);}finally{await closeMainInvocation(prisma);}
  return json(await mainOwnerState(prisma));
 }catch(e){return json({error:e instanceof MainOwnerError?e.message:'operation_failed_check_state_do_not_retry'},409);}
}
