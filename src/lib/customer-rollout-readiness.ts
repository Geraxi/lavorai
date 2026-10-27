import type {PrismaClient} from '@prisma/client';
import {workerGateSelect,ordinaryWorkerIneligibility,admissionBlock,hasPotentialSubmission,postingAlreadyClaimed} from './application-worker-gates';
import {applicationRolloutConfig} from './application-rollout';
import {submissionSubjectKey} from './application-submission-budget';
import {hasCustomerStamp} from './customer-rollout';
import {isAdmin,isTestAccount} from './admin';
import {hasPaidOrTrialApplicationAccess,usesFreeWeeklyQuota,freeWeeklyApplyQuota} from './billing';
import {weeklyQuotaUsageWhere} from './daily-application-cap';
import {inboundReplyAddress} from './email';

type DB=Pick<PrismaClient,'$queryRaw'|'application'|'applicationReleaseGrant'|'applicationSubmissionReservation'|'userInbox'|'inboundEmail'|'applicationReply'|'cVDocument'>;
type Column={table:string;name:string;type:string;required:boolean;default:string|null};
type Constraint={table:string;name:string;definition:string;validated:boolean};
type Index={table:string;definition:string;valid:boolean};
export function assessReleaseSchema(columns:Column[],constraints:Constraint[],indexes:Index[]){
 const issues:string[]=[];
 const expected:Record<string,Record<string,string>>={ApplicationReleaseBatch:{id:'text',maxCount:'integer',usedCount:'integer',createdAt:'timestamp(3) without time zone'},ApplicationReleaseGrant:{applicationId:'text',batchId:'text',releasedAt:'timestamp(3) without time zone'}};
 for(const [table,fields] of Object.entries(expected))for(const [name,type] of Object.entries(fields)){
  const c=columns.find(c=>c.table===table&&c.name===name);
  if(!c||c.type!==type||!c.required)issues.push(`column:${table}.${name}`);
 }
 const required:[string,RegExp][]=[
  ['ApplicationReleaseBatch',/^PRIMARY KEY \(id\)$/],
  ['ApplicationReleaseBatch',/^CHECK maxCount >= 0 AND maxCount <= 5$/],
  ['ApplicationReleaseBatch',/^CHECK usedCount >= 0$/],
  ['ApplicationReleaseBatch',/^CHECK usedCount <= maxCount$/],
  ['ApplicationReleaseGrant',/^PRIMARY KEY \(applicationId\)$/],
  ['ApplicationReleaseGrant',/^FOREIGN KEY \(batchId\) REFERENCES (?:public\.)?ApplicationReleaseBatch\(id\) ON UPDATE CASCADE ON DELETE RESTRICT$/],
 ];
 const normalize=(s:string)=>s.startsWith('CHECK ')?s.replaceAll('"','').replace(/[()]/g,''):s.replaceAll('"','');
 for(const [table,pattern] of required)if(!constraints.some(c=>c.table===table&&c.validated&&pattern.test(normalize(c.definition))))issues.push(`constraint:${table}:${pattern.source}`);
 if(!indexes.some(i=>i.table==='ApplicationReleaseGrant'&&i.valid&&/\("?batchId"?\)/.test(i.definition)))issues.push('index:ApplicationReleaseGrant.batchId');
 const used=columns.find(c=>c.table==='ApplicationReleaseBatch'&&c.name==='usedCount');
 if(used?.default!=='0')issues.push('default:usedCount');
 for(const [table,name] of [['ApplicationReleaseBatch','createdAt'],['ApplicationReleaseGrant','releasedAt']])if(!/CURRENT_TIMESTAMP|now\(\)/i.test(columns.find(c=>c.table===table&&c.name===name)?.default??''))issues.push(`default:${table}.${name}`);
 return{compatible:issues.length===0,issues,columns,constraints,indexes};
}
export async function readReleaseSchema(db:Pick<DB,'$queryRaw'>){
 const columns=await db.$queryRaw<Column[]>`SELECT c.relname::text AS "table",a.attname::text AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS "default" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname IN ('ApplicationReleaseBatch','ApplicationReleaseGrant') AND a.attnum>0 AND NOT a.attisdropped`;
 const constraints=await db.$queryRaw<Constraint[]>`SELECT c.relname::text AS "table",k.conname::text AS name,pg_get_constraintdef(k.oid) AS definition,k.convalidated AS validated FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('ApplicationReleaseBatch','ApplicationReleaseGrant')`;
 const indexes=await db.$queryRaw<Index[]>`SELECT c.relname::text AS "table",pg_get_indexdef(i.indexrelid) AS definition,i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('ApplicationReleaseBatch','ApplicationReleaseGrant')`;
 return assessReleaseSchema(columns,constraints,indexes);
}
/** Bounded read-only snapshot. No reservations, provider requests, CV body or message content. */
export async function customerReadiness(db:DB,now=new Date()){
 const schema=await readReleaseSchema(db);
 try {
 const since=new Date(+now-24*3600_000),policy=applicationRolloutConfig(now);
 const rows=await db.application.findMany({where:{status:'queued',createdAt:{gte:since,lte:now},job:{url:{contains:'.recruitee.com/o/'}}},orderBy:{createdAt:'desc'},take:21,select:workerGateSelect});
 const globalUsed=await db.applicationSubmissionReservation.count({where:{budgetDay:new Date(now.toISOString().slice(0,10)+'T00:00:00.000Z')}});
 const candidates=[];
 for(const row of rows.slice(0,20)){
  if(isAdmin(row.user.email)||isTestAccount(row.user.email))continue;
  const blockers:string[]=[];
  let canonical=false;try{const u=new URL(row.job.url);canonical=u.href===row.job.url&&u.protocol==='https:'&&!u.port&&!u.search&&!u.hash&&!u.username&&!u.password&&/^[-a-z0-9]+\.recruitee\.com$/.test(u.hostname)&&/^\/o\/[a-z0-9-]+$/.test(u.pathname);}catch{}
  if(!canonical)blockers.push('unsupported_provider_origin');
  if(!schema.compatible)blockers.push('release_schema_incompatible');
  const reason=ordinaryWorkerIneligibility(row,now);if(reason)blockers.push(reason);
  const admission=await admissionBlock(db as Parameters<typeof admissionBlock>[0],row);if(admission)blockers.push(admission);
  if(row.startedAt||row.leaseToken||row.retryCount||row.answerContinuationJson||hasCustomerStamp(row.userProvidedAnswersJson)||hasPotentialSubmission(row))blockers.push('not_fresh_unattempted');
  if(!policy.enabled||globalUsed>=(policy.dailyCap??0))blockers.push(policy.reason??'global_quota_reached');
  const [sibling,reservation,grant,inbox,cvCount,weeklyUsed]=await Promise.all([
   db.application.findFirst({where:{userId:row.userId,jobId:row.jobId,id:{not:row.id}},select:{id:true}}),
   db.applicationSubmissionReservation.findFirst({where:{OR:[{applicationId:row.id},{subjectKey:submissionSubjectKey(row.userId,row.jobId)}]},select:{id:true}}),
   schema.compatible?db.applicationReleaseGrant.findUnique({where:{applicationId:row.id},select:{applicationId:true}}):null,
   db.userInbox.findUnique({where:{userId:row.userId},select:{id:true,address:true,disabledAt:true}}),
   db.cVDocument.count({where:{userId:row.userId}}),
   db.application.count({where:weeklyQuotaUsageWhere(row.userId,now,[row.id])}),
  ]);
  if(sibling||reservation||grant||await postingAlreadyClaimed(db as Parameters<typeof postingAlreadyClaimed>[0],row))blockers.push('duplicate_or_prior_reservation');
  if(!row.user.cvProfile||!cvCount)blockers.push('profile_or_cv_missing');
  const alias=process.env.INBOUND_ROUTE_ATS_EMAIL==='false'?null:inboundReplyAddress(row.id);
  const inboxAddress=inbox&&!inbox.disabledAt?inbox.address:null;
  const formEmail=inboxAddress??alias??row.user.email;
  const recipient=formEmail!==row.user.email?formEmail:row.user.cvProfile?.email?.trim()||formEmail;
  const source=inboxAddress?'user_inbox':alias?'application_alias':'profile_or_account';
  const received=inboxAddress?await db.inboundEmail.findFirst({where:{inboxId:inbox!.id,userId:row.userId,toAddress:recipient,provider:'resend'},orderBy:{receivedAt:'desc'},select:{receivedAt:true,providerMessageId:true}}):source==='application_alias'?await db.applicationReply.findFirst({where:{applicationId:row.id,provider:'resend',directRecipient:true,processingAppliedAt:{not:null},isSecurityCode:false},orderBy:{receivedAt:'desc'},select:{receivedAt:true,providerMessageId:true}}):null;
  candidates.push({applicationId:row.id,userId:row.userId,jobId:row.jobId,createdAt:row.createdAt,url:row.job.url,ordinaryPolicyReason:reason,applicationConsentRecorded:!!row.consentGrantedAt,matchingBasis:row.consentGrantedAt?'explicit_job_selection':'current_auto_preferences',blockers:[...new Set(blockers)],account:{verified:!!row.user.emailVerified,privacyConsentRecorded:!!row.user.privacyConsentAt,mode:row.user.preferences?.autoApplyMode,suspended:!!row.user.suspendedAt,paidOrTrialAccess:hasPaidOrTrialApplicationAccess(row.user,now)},quota:{weeklyUsed,weeklyLimit:usesFreeWeeklyQuota(row.user,now)?freeWeeklyApplyQuota():null,globalUsed,globalLimit:policy.dailyCap},profile:{exists:!!row.user.cvProfile,cvCount},recipient:{address:recipient,source,ownership:inboxAddress?'stored_user_mapping':source==='application_alias'?'stored_application_mapping':recipient.toLowerCase()===row.user.email.toLowerCase()&&row.user.emailVerified?'verified_account_address':'unknown',receivingEvidence:received?{receivedAt:received.receivedAt,binding:inboxAddress?'exact_stored_recipient':'application_only_current_alias_unproven',providerMessageRecorded:!!received.providerMessageId} :null},unknowns:['current_offer_required_fields_and_liveness_not_fetched','cv_attachment_readability_not_checked','receiving_evidence_requires_review','transactional_gates_rechecked_at_execution'],status:blockers.length?'blocked':'requires_review'});
 }
 return{observedAt:now.toISOString(),schema,selection:{since,limit:20,truncated:rows.length>20,scanned:Math.min(rows.length,20),excludedAdminAndTestAccounts:true},candidates,activationAuthorized:false};
 }catch(error){return{observedAt:now.toISOString(),schema,candidates:[],activationAuthorized:false,inspectionError:'cohort_read_failed',databaseErrorCode:typeof (error as {code?:unknown})?.code==='string'?(error as {code:string}).code:null};}
}
