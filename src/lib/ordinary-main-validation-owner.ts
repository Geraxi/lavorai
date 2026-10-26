import type {PrismaClient,Prisma} from '@prisma/client';
import {ordinaryValidationPreflight} from './ordinary-validation-preflight';
import {ordinaryValidationConfig} from './ordinary-validation';
import {MAIN_VALIDATION_USER as USER,MAIN_VALIDATION_EMAIL as EMAIL,MAIN_VALIDATION_APP as APP,MAIN_VALIDATION_OFFER as OFFER,mainMeta,encodeMainMeta,mainSourceSnapshot,mainSourceMatches} from './ordinary-main-validation-scope';
export {MAIN_VALIDATION_APP} from './ordinary-main-validation-scope';
const JOB=APP+'_job';
export class MainOwnerError extends Error{}
function holds(){if(process.env.APPLICATIONS_PAUSED!=='true'||process.env.USER_NOTIFICATIONS_HOLD!=='true'||process.env.ATS_TEST_REAL_SUBMIT!=='false')throw new MainOwnerError('required_holds_not_set');}
async function lock(tx:Prisma.TransactionClient){
 await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${USER}))`;
 await tx.$queryRaw`SELECT id FROM "User" WHERE id=${USER} FOR UPDATE`;
 const user=await tx.user.findUnique({where:{id:USER},select:{email:true}});
 if(user?.email!==EMAIL)throw new MainOwnerError('identity_mismatch');
}
const report=(db:any)=>ordinaryValidationPreflight(db,new Date(),{userId:USER,email:EMAIL});
export async function mainOwnerState(db:PrismaClient){
 const [preflight,app,source]=await Promise.all([report(db),db.application.findUnique({where:{id:APP},select:{id:true,jobId:true,createdAt:true,userProvidedAnswersJson:true,status:true,submitConfirmation:true,submittedVia:true,submittedAt:true,submissionReceiptJson:true,sendStatus:true,sendFailureReason:true}}),mainSourceSnapshot(db)]);
 const meta=mainMeta(app?.userProvidedAnswersJson),config=ordinaryValidationConfig();
 return {preflight,source:source?{id:source.cvId,filename:source.filename,hash:source.cvHash}:null,application:app?{...app,userProvidedAnswersJson:undefined}:null,setup:meta?{state:meta.state,recipient:meta.recipient,verifiedAt:meta.verifiedAt,closedAt:meta.closedAt}:null,window:config?.id===APP?{expiresAt:config.end.toISOString(),recipient:config.recipient}:null};
}
export async function prepareMainApplication(db:PrismaClient,cvId:string,cvHash:string){
 holds();
 await db.$transaction(async tx=>{
  await lock(tx);holds();
  const source=await mainSourceSnapshot(tx);if(!source||source.cvId!==cvId||source.cvHash!==cvHash)throw new MainOwnerError('confirmed_cv_changed_or_not_ready');
  const prior=await tx.application.findUnique({where:{id:APP}});
  if(prior){if(prior.userId!==USER||prior.jobId!==JOB)throw new MainOwnerError('application_scope_mismatch');const meta=mainMeta(prior.userProvidedAnswersJson);if(!meta||!['prepared','verified'].includes(meta.state)||!await mainSourceMatches(tx,meta))throw new MainOwnerError('already_invoked_closed_or_source_changed');return;}
  const preflight=await report(tx);if(!preflight.blockers||preflight.blockers.length)throw new MainOwnerError('ordinary_eligibility_blocked');
  if(preflight.application?.count)throw new MainOwnerError('existing_application_preserved');
  const at=new Date();
  await tx.job.create({data:{id:JOB,externalId:JOB,source:'recruitee',title:'LavorAI TEST — Ordinary Validation',company:'ProduzioneWeb',url:OFFER,description:'Technical integration test — not a real vacancy. Do not apply.'}});
  await tx.application.create({data:{id:APP,userId:USER,jobId:JOB,portal:'recruitee',status:'queued',createdAt:at,consentGrantedAt:at,userProvidedAnswersJson:encodeMainMeta({kind:'main-ordinary-validation-v1',state:'prepared',preparedAt:at.toISOString(),cvId:source.cvId,cvHash:source.cvHash,profileHash:source.profileHash})}});
 });
 return mainOwnerState(db);
}
export async function verifyMainRecipient(db:PrismaClient,recipient:string,evidence:string){
 holds();if(evidence.trim().length<15||evidence.length>500)throw new MainOwnerError('receiving_evidence_required');
 await db.$transaction(async tx=>{
  await lock(tx);holds();const p=await report(tx);
  const app=await tx.application.findUnique({where:{id:APP}}),meta=mainMeta(app?.userProvidedAnswersJson);
  if(app?.userId!==USER||app.jobId!==JOB||!meta||!['prepared','verified'].includes(meta.state)||!await mainSourceMatches(tx,meta))throw new MainOwnerError('source_changed_or_not_verifiable');
  if(!p.blockers||p.blockers.length||!p.recipient?.address||p.recipient.address!==recipient)throw new MainOwnerError('preflight_blocked_or_recipient_changed');
  await tx.application.update({where:{id:APP},data:{userProvidedAnswersJson:encodeMainMeta({...meta,state:'verified',recipient,receivingEvidence:evidence.trim(),verifiedAt:new Date().toISOString()})}});
 });return mainOwnerState(db);
}
export async function claimMainInvocation(db:PrismaClient){
 holds();await db.$transaction(async tx=>{
  await lock(tx);holds();const p=await report(tx),config=ordinaryValidationConfig();
  const app=await tx.application.findUnique({where:{id:APP}}),meta=mainMeta(app?.userProvidedAnswersJson);
  if(!app||app.userId!==USER||app.jobId!==JOB||!meta||meta.state!=='verified'||!await mainSourceMatches(tx,meta))throw new MainOwnerError('already_invoked_or_source_changed');
  if(!p.blockers||p.blockers.length||!p.recipient?.address||meta.recipient!==p.recipient.address)throw new MainOwnerError('ordinary_eligibility_or_recipient_blocked');
  if(!config||config.id!==APP||config.userId!==USER||config.userEmail!==EMAIL||config.jobId!==app.jobId||config.url!==OFFER||config.recipient!==meta.recipient||+config.end-+config.start>15*60_000||process.env.ORDINARY_VALIDATION_CREATED_AT!==app.createdAt.toISOString())throw new MainOwnerError('exact_operator_window_required');
  if(app.status!=='queued'||app.startedAt||app.leaseToken||app.submitStartedAt||app.submitConfirmation||app.submittedAt||app.retryCount)throw new MainOwnerError('application_not_fresh');
  await tx.application.update({where:{id:APP},data:{userProvidedAnswersJson:encodeMainMeta({...meta,state:'running'})}});
 });
}
export async function closeMainInvocation(db:PrismaClient){
 await db.$transaction(async tx=>{
  await lock(tx);const app=await tx.application.findUnique({where:{id:APP}}),meta=mainMeta(app?.userProvidedAnswersJson);
  if(app?.userId!==USER||app.jobId!==JOB||!meta)throw new MainOwnerError('not_prepared');
  await tx.application.update({where:{id:APP},data:{userProvidedAnswersJson:encodeMainMeta({...meta,state:'closed',closedAt:meta.closedAt??new Date().toISOString()})}});
 });return mainOwnerState(db);
}
