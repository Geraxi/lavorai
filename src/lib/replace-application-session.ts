import type {PrismaClient} from '@prisma/client';
/** Explicit owner action only. Preserve old counters/attempts; create a new
 * generation under the category key that manual application resolution uses. */
export async function replaceCompletedSession(db:PrismaClient,userId:string,id:string,cutoff:Date|null){
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`session-replacement:${userId}`}))`;
  const old=await tx.applicationSession.findUnique({where:{id}});
  if(!old||old.userId!==userId)return {ok:false as const,error:'not_found'};
  const prefix=`archived::${old.id}::`;
  if(old.key.startsWith(prefix)){
   const existing=await tx.applicationSession.findUnique({where:{userId_key:{userId,key:old.key.slice(prefix.length)}}});
   return existing?{ok:true as const,sessionId:existing.id,moved:0,replayed:true}:{ok:false as const,error:'replacement_missing'};
  }
  if(!old.completedAt&&!['completed','cancelled'].includes(old.status)&&old.sentCount<old.targetCount)return {ok:false as const,error:'session_not_complete'};
  const active=await tx.applicationSession.count({where:{userId,id:{not:id},status:{in:['active','auto','paused']}}});
  if(active>=3)return {ok:false as const,error:'too_many_sessions'};
  await tx.applicationSession.update({where:{id},data:{key:prefix+old.key,status:old.status==='cancelled'?'cancelled':'completed',completedAt:old.completedAt??new Date(),completedAcknowledgedAt:new Date()}});
  const fresh=await tx.applicationSession.create({data:{userId,key:old.key,label:old.label,title:old.title,customContext:old.customContext,targetCount:old.targetCount,status:'active'}});
  const moved=cutoff?await tx.application.updateMany({where:{userId,sessionId:id,status:'awaiting_consent',createdAt:{gt:cutoff},startedAt:null,completedAt:null,consentGrantedAt:null,retryCount:0,submitStartedAt:null,submittedAt:null,submittedVia:null,submitConfirmation:null,submitClickPerformedAt:null,outboundSubmissionJson:null,submissionReceiptJson:null,destinationResponseJson:null,canaryLog:null,answersUsedJson:null,viewedAt:null,lastReplyAt:null,replyCount:0,userStatus:null,leaseToken:null},data:{sessionId:fresh.id}}):{count:0};
  return {ok:true as const,sessionId:fresh.id,moved:moved.count,replayed:false};
 },{timeout:5000});
}
