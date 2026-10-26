import {prisma} from './db';
import {customerRolloutConfig,hasCustomerStamp,stopCustomerBatch} from './customer-rollout';
/** Separate from generic drain: never scans/parks/recovers the unrelated queue. */
export async function drainCustomerRollout(run:(id:string)=>Promise<void>,db=prisma){
 const cfg=customerRolloutConfig();
 if(!cfg)return{active:false,attempted:0,outcomes:[]};
 const outcomes:Array<{id:string;status:string;confirmation:string|null}>=[];
 let attempted=0;const started=Date.now();
 for(const selected of cfg.applications){
  if(Date.now()-started>240_000||!customerRolloutConfig())break;
  const row=await db.application.findUnique({where:{id:selected.applicationId},select:{status:true,startedAt:true,userProvidedAnswersJson:true}});
  if(!row||row.status!=='queued'||row.startedAt||hasCustomerStamp(row.userProvidedAnswersJson))continue;
  attempted++;try{await run(selected.applicationId);}catch(error){await stopCustomerBatch(db,cfg.batchId);throw error;}
  const after=await db.application.findUnique({where:{id:selected.applicationId},select:{status:true,submitConfirmation:true,userProvidedAnswersJson:true}});
  if(after)outcomes.push({id:selected.applicationId,status:after.status,confirmation:after.submitConfirmation});
  if(after&&hasCustomerStamp(after.userProvidedAnswersJson)&&!(after.status==='success'&&after.submitConfirmation?.startsWith('DETECTED'))){await stopCustomerBatch(db,cfg.batchId);break;}
 }
 return{active:true,batchId:cfg.batchId,attempted,outcomes};
}
