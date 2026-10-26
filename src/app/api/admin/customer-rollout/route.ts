import {checkOrigin} from '@/lib/csrf';
import {NextRequest,NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/session';
import {isAdmin} from '@/lib/admin';
import {prisma} from '@/lib/db';
import {customerRolloutConfig,customerRolloutConfigured,inspectCustomerManifest,stopCustomerBatch,customerBatchStopped} from '@/lib/customer-rollout';
import {customerReadiness} from '@/lib/customer-rollout-readiness';
import {deployedAppVersion} from '@/lib/deployed-version';
export const dynamic='force-dynamic';export const runtime='nodejs';
/** Read-only status. No activation, preparation, grant or send action. */
export async function GET(){
 try {
 const actor=await getCurrentUser();if(!isAdmin(actor?.email))return NextResponse.json({error:'forbidden'},{status:403});
 const active=customerRolloutConfig(),cfg=inspectCustomerManifest();
 const readiness=await customerReadiness(prisma);
 const storageReady=readiness.schema.compatible;
 const batch=cfg&&storageReady?await prisma.applicationReleaseBatch.findUnique({where:{id:'customer:'+cfg.batchId},select:{id:true,maxCount:true,usedCount:true}}):null;
 const stopped=cfg&&storageReady?(await customerBatchStopped(prisma,cfg.batchId)||batch?.maxCount===0):false;
 const applications=cfg?await prisma.application.findMany({where:{id:{in:cfg.applications.map(a=>a.applicationId)}},select:{id:true,status:true,submitConfirmation:true,submittedAt:true,submittedVia:true,sendStatus:true,sendFailureReason:true}}):[];
 return NextResponse.json({deployedVersion:deployedAppVersion(),configured:customerRolloutConfigured(),active:!!active&&storageReady&&!stopped,storageReady,stopped,readiness,holds:{applicationsPaused:process.env.APPLICATIONS_PAUSED==='true',notificationsHeld:process.env.USER_NOTIFICATIONS_HOLD==='true',diagnosticDisabled:process.env.ATS_TEST_REAL_SUBMIT==='false'},batch,batchId:cfg?.batchId??null,expiresAt:cfg?.expiresAt??null,applications},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){
  const code=typeof (error as {code?:unknown})?.code==='string'?(error as {code:string}).code:'unavailable';
  console.error('[customer-rollout] read-only report failed', {code});
  return NextResponse.json({error:'readiness_unavailable',databaseErrorCode:code,deployedVersion:deployedAppVersion(),active:false,activationAuthorized:false},{status:503,headers:{'Cache-Control':'private, no-store'}});
 }
}

/** Stop only; this action can never enable or run a cohort. */
export async function POST(request:NextRequest){
 const actor=await getCurrentUser();if(!isAdmin(actor?.email)||!checkOrigin(request))return NextResponse.json({error:'forbidden'},{status:403});
 const body=await request.json().catch(()=>null),cfg=inspectCustomerManifest();
 if(!cfg||!body||Object.keys(body).length!==2||body.action!=='stop'||body.batchId!==cfg.batchId)return NextResponse.json({error:'invalid_stop_scope'},{status:400});
 await stopCustomerBatch(prisma,cfg.batchId);return NextResponse.json({stopped:true,batchId:cfg.batchId});
}
