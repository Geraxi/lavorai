import type { PrismaClient, Prisma } from '@prisma/client';
import { PREFLIGHT_USER_ID as USER, PREFLIGHT_USER_EMAIL as EMAIL, PREFLIGHT_OFFER as OFFER, ordinaryValidationPreflight } from './ordinary-validation-preflight';
import { EMPTY_PROFILE, profileToRow } from './cv-profile-types';
import { ordinaryValidationConfig } from './ordinary-validation';
export const OWNER_APP = 'ordinary_validation_produzioneweb_20261026';
const DOC = OWNER_APP + '_source';
const JOB = OWNER_APP + '_job';
const TITLE = 'LavorAI TEST — Ordinary Validation';
const SUMMARY = 'Synthetic validation profile — not a real applicant. Software testing, TypeScript and automated testing. No employment history, education, qualifications, salary, availability or location claimed.';
type Meta = {kind:'ordinary-validation-v1'; actor:string; preparedAt:string; privacyNotice:string; state:'prepared'|'verified'|'running'|'closed'; recipient?:string; verifiedAt?:string; ownershipEvidence?:string; closedAt?:string};
export class OwnerFlowError extends Error {}
function holds() { if(process.env.APPLICATIONS_PAUSED!=='true'||process.env.USER_NOTIFICATIONS_HOLD!=='true'||process.env.ATS_TEST_REAL_SUBMIT!=='false') throw new OwnerFlowError('required_holds_not_set'); }
function metadata(raw:string|null|undefined):Meta { try {const m=JSON.parse(raw??'');if(m.kind==='ordinary-validation-v1')return m;}catch{} throw new OwnerFlowError('fixture_metadata_missing'); }
async function lock(tx:Prisma.TransactionClient) {
 await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${USER}))`;
 const user=await tx.user.findUnique({where:{id:USER},select:{email:true,suspendedAt:true,emailVerified:true,privacyConsentAt:true}});
 if(!user||user.email!==EMAIL)throw new OwnerFlowError('identity_mismatch');
 return user;
}
export async function ownerFlowState(db:PrismaClient) {
 const result=await ordinaryValidationPreflight(db);
 const doc=await db.cVDocument.findUnique({where:{id:DOC},select:{parsedProfileJson:true}});
 const meta=doc?metadata(doc.parsedProfileJson):null;
 const config=ordinaryValidationConfig();
 const outcome=await db.application.findUnique({where:{id:OWNER_APP},select:{id:true,status:true,submitConfirmation:true,submittedVia:true,submittedAt:true,submissionReceiptJson:true,sendStatus:true,sendFailureReason:true}});
 return {preflight:result,outcome,setup:meta?{state:meta.state,preparedAt:meta.preparedAt,verifiedAt:meta.verifiedAt,recipient:meta.recipient,closedAt:meta.closedAt}:null,
 window:config?.id===OWNER_APP?{expiresAt:config.end.toISOString(),recipient:config.recipient}:null,applicationId:OWNER_APP};
}
export async function prepareOwnerFixture(db:PrismaClient, actor:string, phone:string, render:(p:typeof EMPTY_PROFILE)=>Promise<Buffer>) {
 holds();
 if(!/^[+0-9 ()-]{7,24}$/.test(phone))throw new OwnerFlowError('approved_phone_required');
 // Render in memory; no provider/storage upload. Source PDF and provenance are
 // committed together in PostgreSQL, not published as a public contact-data blob.
 const profile={...EMPTY_PROFILE,firstName:'LavorAI',lastName:'Test',email:EMAIL,phone,title:'Synthetic validation profile',summary:SUMMARY,skills:[{name:'TypeScript'},{name:'Automated testing'}]};
 const pdf=await render(profile);
 if(!pdf.subarray(0,5).equals(Buffer.from('%PDF-'))||pdf.length>500_000)throw new OwnerFlowError('invalid_synthetic_pdf');
 await db.$transaction(async tx=>{
  const user=await lock(tx); holds();
  const prior=await tx.cVDocument.findUnique({where:{id:DOC}});
  if(prior){const m=metadata(prior.parsedProfileJson);if(m.state==='closed')throw new OwnerFlowError('fixture_closed');
   const p=await tx.cVProfile.findUnique({where:{userId:USER},select:{phone:true}});
   if(p?.phone!==phone)throw new OwnerFlowError('prepared_phone_mismatch');
   return;
  }
  if(user.suspendedAt||!user.emailVerified)throw new OwnerFlowError('account_not_verified_or_suspended');
  if(await tx.cVProfile.count({where:{userId:USER}})||await tx.cVDocument.count({where:{userId:USER}}))throw new OwnerFlowError('existing_profile_or_cv_preserved');
  if(await tx.application.count({where:{userId:USER,job:{url:OFFER}}}))throw new OwnerFlowError('existing_application_preserved');
  const prefs=await tx.userPreferences.findUnique({where:{userId:USER},select:{autoApplyMode:true}});
  if(prefs&&prefs.autoApplyMode!=='off')throw new OwnerFlowError('existing_preference_preserved');
  const at=new Date();
  const meta:Meta={kind:'ordinary-validation-v1',actor,preparedAt:at.toISOString(),privacyNotice:'https://lavorai.it/privacy',state:'prepared'};
  await tx.user.updateMany({where:{id:USER,privacyConsentAt:null},data:{privacyConsentAt:at}});
  // autoApplyOn remains false: no scheduled producer is enabled.
  await tx.userPreferences.upsert({where:{userId:USER},create:{userId:USER,autoApplyMode:'manual',autoApplyOn:false},update:{autoApplyMode:'manual',autoApplyOn:false}});
  await tx.cVProfile.create({data:{userId:USER,...profileToRow(profile)}});
  await tx.cVDocument.create({data:{id:DOC,userId:USER,originalFilename:'lavorai-test-ordinary.pdf',storagePath:'data:application/pdf;base64,'+pdf.toString('base64'),extractedText:SUMMARY+'\nLavorAI Test\n'+EMAIL+'\n'+phone,parsedProfileJson:JSON.stringify(meta)}});
  await tx.job.create({data:{id:JOB,externalId:JOB,source:'recruitee',title:TITLE,company:'ProduzioneWeb',url:OFFER,description:'Technical integration test — not a real vacancy. Do not apply.'}});
  await tx.application.create({data:{id:OWNER_APP,userId:USER,jobId:JOB,portal:'recruitee',status:'queued',createdAt:at,consentGrantedAt:at}});
 });
 return ownerFlowState(db);
}
export async function verifyOwnerRecipient(db:PrismaClient, recipient:string, evidence:string) {
 holds();
 if(evidence.trim().length<15||evidence.length>500)throw new OwnerFlowError('receiving_evidence_required');
 const report=await ordinaryValidationPreflight(db);
 if(!report.recipient?.address||report.recipient.address!==recipient||!report.blockers||report.blockers.length)throw new OwnerFlowError('preflight_blocked_or_recipient_changed');
 await db.$transaction(async tx=>{
  await lock(tx);holds();
  const doc=await tx.cVDocument.findUnique({where:{id:DOC}});
  const m=metadata(doc?.parsedProfileJson);if(!['prepared','verified'].includes(m.state))throw new OwnerFlowError('fixture_not_verifiable');
  await tx.cVDocument.update({where:{id:DOC},data:{parsedProfileJson:JSON.stringify({...m,state:'verified',recipient,verifiedAt:new Date().toISOString(),ownershipEvidence:evidence.trim()})}});
 });
 return ownerFlowState(db);
}
export async function closeOwnerFixture(db:PrismaClient) {
 // Closing only reduces access; allow it even if an external operator changed a hold.
 await db.$transaction(async tx=>{
  await lock(tx);
  const doc=await tx.cVDocument.findUnique({where:{id:DOC}});
  if(!doc)throw new OwnerFlowError('fixture_not_prepared');
  const m=metadata(doc.parsedProfileJson);
  await tx.userPreferences.updateMany({where:{userId:USER,autoApplyMode:'manual'},data:{autoApplyMode:'off',autoApplyOn:false}});
  await tx.cVDocument.update({where:{id:DOC},data:{parsedProfileJson:JSON.stringify({...m,state:'closed',closedAt:m.closedAt??new Date().toISOString()})}});
 });
 return ownerFlowState(db);
}
export async function claimOwnerInvocation(db:PrismaClient) {
 holds();
 const report=await ordinaryValidationPreflight(db);
 if(!report.blockers||report.blockers.length||!report.recipient?.address)throw new OwnerFlowError('preflight_blocked');
 const address=report.recipient.address;
 const config=ordinaryValidationConfig();
 if(!config||config.id!==OWNER_APP||config.userId!==USER||config.userEmail!==EMAIL||config.url!==OFFER||config.recipient!==address)throw new OwnerFlowError('operator_window_required');
 await db.$transaction(async tx=>{
  await lock(tx);holds();
  const doc=await tx.cVDocument.findUnique({where:{id:DOC}});
  const m=metadata(doc?.parsedProfileJson);
  if(m.state!=='verified'||m.recipient!==address)throw new OwnerFlowError('recipient_unverified_or_already_invoked');
  const app=await tx.application.findUnique({where:{id:OWNER_APP}});
  if(!app||app.status!=='queued'||app.startedAt||app.leaseToken||app.submitStartedAt||app.submitConfirmation||app.submittedAt||app.retryCount)throw new OwnerFlowError('application_not_fresh');
  await tx.cVDocument.update({where:{id:DOC},data:{parsedProfileJson:JSON.stringify({...m,state:'running'})}});
 });
}
