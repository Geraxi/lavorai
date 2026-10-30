import type {PrismaClient} from '@prisma/client';
import {readUserFile} from '../storage';
import {loadOwnedBrowserInput} from './owned-browser-input';
type Request=Omit<Parameters<typeof loadOwnedBrowserInput>[0],'owner'|'enabled'>;
/** Server-only wiring. Owner comes from authenticated session, never request JSON.
 * Deliberately not registered in any route/worker; production remains disabled. */
export async function loadDatabaseBrowserInput(db:PrismaClient,authenticatedOwner:string|null,request:Request,enabled=false){
 if(!enabled||!authenticatedOwner||process.env.NODE_ENV==='production')throw Error('Browser profile integration disabled');
 return loadOwnedBrowserInput({...request,enabled,owner:authenticatedOwner},{
  application:(id,userId)=>db.application.findFirst({where:{id,userId},select:{id:true,userId:true,leaseToken:true,leaseExpiresAt:true,submitStartedAt:true,completedAt:true}}),
  profile:(userId)=>db.cVProfile.findUnique({where:{userId},select:{userId:true,firstName:true,lastName:true,email:true,phone:true}}),
  document:(id,userId)=>db.cVDocument.findFirst({where:{id,userId},select:{id:true,userId:true,originalFilename:true,storagePath:true}}),
  file:readUserFile,
 });
}
