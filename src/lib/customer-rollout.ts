/** Exact customer cohort, inert until separately authorized/configured. No ordinary gate overlays. */
import type {Prisma,PrismaClient} from '@prisma/client';
type Env=Record<string,string|undefined>;
export type CustomerEntry={applicationId:string;userId:string;jobId:string;url:string;recipient:string;createdAt:string};
export type CustomerConfig={batchId:string;startedAt:Date;expiresAt:Date;notBefore:Date;maxAttempts:number;applications:CustomerEntry[]};
export function customerRolloutConfigured(env:Env=process.env){return !!env.CUSTOMER_ROLLOUT_MANIFEST?.trim()||!!env.CUSTOMER_ROLLOUT_ENABLED?.trim()&&env.CUSTOMER_ROLLOUT_ENABLED!=='false';}
const validDate=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(+new Date(v));
export function customerRolloutConfig(env:Env=process.env,now=new Date()):CustomerConfig|null{
 if(env.CUSTOMER_ROLLOUT_ENABLED!=='true'||env.APPLICATIONS_PAUSED!=='true'||env.USER_NOTIFICATIONS_HOLD!=='true'||env.ATS_TEST_REAL_SUBMIT!=='false'||env.ORDINARY_VALIDATION_APPLICATION_ID?.trim())return null;
 try{
  if((env.CUSTOMER_ROLLOUT_MANIFEST?.length??0)>12000)return null;
  const m=JSON.parse(env.CUSTOMER_ROLLOUT_MANIFEST??'');
  if(!/^[a-z0-9-]{1,60}$/.test(m.batchId)||!validDate(m.startedAt)||!validDate(m.expiresAt)||!validDate(m.notBefore))return null;
  const startedAt=new Date(m.startedAt),expiresAt=new Date(m.expiresAt),notBefore=new Date(m.notBefore);
  if(+startedAt>+now||+expiresAt<=+now||+expiresAt<=+startedAt||+expiresAt-+startedAt>30*60_000||+notBefore>+startedAt||+startedAt-+notBefore>24*60*60_000)return null;
  if(!Array.isArray(m.applications)||!m.applications.length||m.applications.length>5||!Number.isInteger(m.maxAttempts)||m.maxAttempts<1||m.maxAttempts>m.applications.length)return null;
  const ids=new Set<string>();
  for(const a of m.applications){
   if(!a||!['applicationId','userId','jobId'].every(k=>typeof a[k]==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(a[k]))||ids.has(a.applicationId)||!validDate(a.createdAt))return null;
   if(+new Date(a.createdAt)<+notBefore||+new Date(a.createdAt)>+startedAt)return null;
   const u=new URL(a.url);
   if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.href!==a.url||!/^[-a-z0-9]+\.recruitee\.com$/.test(u.hostname)||!/^\/o\/[a-z0-9-]+$/.test(u.pathname))return null;
   if(typeof a.recipient!=='string'||! /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(a.recipient))return null;
   ids.add(a.applicationId);
  }
  return{...m,startedAt,expiresAt,notBefore};
 }catch{return null;}
}
type Row={id:string;userId:string;jobId:string;createdAt:Date;job:{url:string};userProvidedAnswersJson?:string|null};
export function customerRolloutId(id:string){return !!customerRolloutConfig()?.applications.some(a=>a.applicationId===id);}
export function customerRolloutRow(row:Row,config=customerRolloutConfig()){
 const a=config?.applications.find(a=>a.applicationId===row.id);
 return !!a&&a.userId===row.userId&&a.jobId===row.jobId&&a.url===row.job.url&&+new Date(a.createdAt)===+row.createdAt;
}
export function customerRolloutDestination(id:string,adapter:string,url:string,recipient:string){
 const a=customerRolloutConfig()?.applications.find(a=>a.applicationId===id);
 return !!a&&adapter==='recruitee'&&a.url===url&&a.recipient===recipient;
}
export function customerStamp(raw:string|null|undefined):{batchId:string;leaseToken:string}|null{
 try{const m=JSON.parse(raw??'').customerRollout;return m&&typeof m.batchId==='string'&&typeof m.leaseToken==='string'?m:null;}catch{return null;}
}
export function hasCustomerStamp(raw:string|null|undefined){return !!raw?.includes('"customerRollout"');}
/** Same transaction as queued -> optimizing. Unique grant is never refunded,
 * including AI failure, crash or rejection before provider submission. */
export async function claimCustomerSlot(tx:Prisma.TransactionClient,row:Row,leaseToken:string):Promise<string|null>{
 await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(1735274851,20261026)`;
 const clocks=await tx.$queryRaw<{now:Date}[]>`SELECT clock_timestamp() AS now`;
 if(!(clocks[0]?.now instanceof Date))return null;
 const cfg=customerRolloutConfig(process.env,clocks[0].now);
 if(!cfg||!customerRolloutRow(row,cfg)||hasCustomerStamp(row.userProvidedAnswersJson))return null;
 const batchId='customer:'+cfg.batchId;
 if(await customerBatchStopped(tx,cfg.batchId))return null;
 await tx.applicationReleaseBatch.upsert({where:{id:batchId},create:{id:batchId,maxCount:cfg.maxAttempts},update:{}});
 const batch=await tx.applicationReleaseBatch.findUnique({where:{id:batchId}});
 if(!batch||batch.maxCount!==cfg.maxAttempts||await tx.applicationReleaseGrant.findUnique({where:{applicationId:row.id}}))return null;
 const used=await tx.applicationReleaseBatch.updateMany({where:{id:batchId,maxCount:cfg.maxAttempts,usedCount:{lt:cfg.maxAttempts}},data:{usedCount:{increment:1}}});
 if(used.count!==1)return null;
 await tx.applicationReleaseGrant.create({data:{applicationId:row.id,batchId}});
 let answers:Record<string,unknown>={version:1,applicationId:row.id,answers:[]};
 if(row.userProvidedAnswersJson){answers=JSON.parse(row.userProvidedAnswersJson);if(!answers||Array.isArray(answers)||answers.applicationId!==row.id)throw Error('customer_answers_invalid');}
 return JSON.stringify({...answers,customerRollout:{batchId,leaseToken}});
}
/** Rechecks cannot turn a grant into a new work lease or another batch. */
export async function customerGrantMatches(tx:Prisma.TransactionClient,row:Row&{leaseToken:string|null}){
 const stamp=customerStamp(row.userProvidedAnswersJson),cfg=customerRolloutConfig();
 if(!stamp||!cfg||!customerRolloutRow(row,cfg)||stamp.leaseToken!==row.leaseToken||stamp.batchId!=='customer:'+cfg.batchId)return false;
 const grant=await tx.applicationReleaseGrant.findUnique({where:{applicationId:row.id}});
 const batch=await tx.applicationReleaseBatch.findUnique({where:{id:stamp.batchId}});
 return grant?.batchId===stamp.batchId&&batch?.maxCount===cfg.maxAttempts&&!await customerBatchStopped(tx,cfg.batchId);
}

/** Inspection only: structurally validate a retained manifest even after disable/expiry.
 * Never use this result to authorize work. */
export function inspectCustomerManifest(env:Env=process.env):CustomerConfig|null{
 try{const m=JSON.parse(env.CUSTOMER_ROLLOUT_MANIFEST??'');if(!validDate(m.startedAt))return null;
 return customerRolloutConfig({...env,CUSTOMER_ROLLOUT_ENABLED:'true',APPLICATIONS_PAUSED:'true',USER_NOTIFICATIONS_HOLD:'true',ATS_TEST_REAL_SUBMIT:'false',ORDINARY_VALIDATION_APPLICATION_ID:''},new Date(m.startedAt));}catch{return null;}
}
/** A separate zero-budget tombstone preserves the real budget and all CHECKs.
 * Never delete/reopen tombstones. The same lock serializes stop with new grants. */
export async function customerBatchStopped(db:Pick<Prisma.TransactionClient,'applicationReleaseBatch'>,batchId:string){
 return !!await db.applicationReleaseBatch.findUnique({where:{id:'customer-stop:'+batchId},select:{id:true}});
}
export async function stopCustomerBatch(db:Pick<PrismaClient,'$transaction'>,batchId:string){
 if(!/^[a-z0-9-]{1,60}$/.test(batchId))throw Error('invalid_customer_batch');
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(1735274851,20261026)`;
  await tx.applicationReleaseBatch.upsert({where:{id:'customer-stop:'+batchId},create:{id:'customer-stop:'+batchId,maxCount:0,usedCount:0},update:{}});
 });
}
