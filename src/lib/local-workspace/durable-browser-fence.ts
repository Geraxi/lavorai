import {PrismaClient} from '@prisma/client';
import {reserveApplicationWork,beginApplicationSubmission,recheckApplicationSubmission} from '../application-worker-gates';
import {liveLeaseWhere,type ApplicationWorkLease} from '../application-lease';
/** Disabled integration seam using existing durable ordinary gates, never a diagnostic bypass. */
export function durableBrowserFence(configuration:{enabled:boolean;databaseUrl:string}){
 const url=new URL(configuration.databaseUrl);
 if(!configuration.enabled||process.env.NODE_ENV==='production'||url.hostname!=='127.0.0.1'||url.pathname!=='/lavorai_ordinary_test')throw Error('Local durable browser integration disabled');
 const db=new PrismaClient({datasources:{db:{url:configuration.databaseUrl}}});
 async function owned(id:string,owner:string){if(!await db.application.findFirst({where:{id,userId:owner},select:{id:true}}))throw Error('Application unavailable');}
 return {
  close:()=>db.$disconnect(),
  async reserve(id:string,owner:string){await owned(id,owner);return reserveApplicationWork(id,db);},
  async beforeData(id:string,owner:string,lease:ApplicationWorkLease,channel:string){await owned(id,owner);return beginApplicationSubmission(id,lease,db,channel);},
  async beforeSubmit(id:string,owner:string,lease:ApplicationWorkLease,channel:string){
   await owned(id,owner);
   if(!await recheckApplicationSubmission(id,lease,db,channel))return false;
   // One durable right to click, across coordinators/restarts. Never clear on uncertainty.
   const claimed=await db.application.updateMany({where:{...liveLeaseWhere(id,lease),userId:owner,status:'applying',submitConfirmation:'SUBMISSION_STARTED',submitClickPerformedAt:null},data:{submitClickPerformedAt:new Date()}});
   return claimed.count===1;
  },
 };
}
