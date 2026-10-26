import {NextRequest,NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/session';
import {isAdmin} from '@/lib/admin';
import {checkOrigin} from '@/lib/csrf';
import {prisma} from '@/lib/db';
import {ownerFlowState,prepareOwnerFixture,verifyOwnerRecipient,closeOwnerFixture,claimOwnerInvocation,OwnerFlowError,OWNER_APP} from '@/lib/ordinary-validation-owner';
import {renderCVPdf} from '@/lib/cv-pdf';
import {processApplication} from '@/lib/application-worker';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest){
 const actor=await getCurrentUser();if(!isAdmin(actor?.email))return response({error:'forbidden'},403);
 if(request.nextUrl.search)return response({error:'scope_is_fixed'},400);
 return response(await ownerFlowState(prisma));
}
export async function POST(request:NextRequest){
 const actor=await getCurrentUser();if(!actor||!isAdmin(actor.email)||!checkOrigin(request))return response({error:'forbidden'},403);
 const raw=await request.text();if(raw.length>2048)return response({error:'body_too_large'},400);
 let body:any;try{body=JSON.parse(raw);}catch{return response({error:'invalid_json'},400);}
 const fields:Record<string,string[]>={prepare:['action','phone','consent'],verify:['action','recipient','evidence','ownsAndReceives'],close:['action'],run:['action','confirmOneSubmission']};
 if(!body||!Object.hasOwn(fields,body.action)||Object.keys(body).some(k=>!fields[body.action].includes(k)))return response({error:'invalid_request'},400);
 try{
  if(body.action==='prepare'){
   if(body.consent!==true||typeof body.phone!=='string')return response({error:'explicit_consent_required'},400);
   return response(await prepareOwnerFixture(prisma,actor.id,body.phone,p=>renderCVPdf(p,'en')));
  }
  if(body.action==='verify'){
   if(body.ownsAndReceives!==true||typeof body.recipient!=='string'||typeof body.evidence!=='string')return response({error:'explicit_ownership_evidence_required'},400);
   return response(await verifyOwnerRecipient(prisma,body.recipient,body.evidence));
  }
  if(body.action==='close')return response(await closeOwnerFixture(prisma));
  if(body.confirmOneSubmission!==true)return response({error:'explicit_single_submit_required'},400);
  await claimOwnerInvocation(prisma);
  try{await processApplication(OWNER_APP);}finally{await closeOwnerFixture(prisma);}
  return response(await ownerFlowState(prisma));
 }catch(e){return response({error:e instanceof OwnerFlowError?e.message:'operation_failed_check_state_do_not_retry'},409);}
}
