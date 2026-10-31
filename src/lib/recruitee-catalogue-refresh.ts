import type { PrismaClient } from '@prisma/client';
import {canonicalRecruiteeOffer, classifyRecruiteeForm, type FormCapability} from './recruitee-form-capability';
import {PUBLICATION_FRESH_MS,OWNED_TEST_PREFIX} from './job-catalogue-policy';
import {discoverRecruiteeCatalogue} from './recruitee-catalogue-discovery';
type Target = {id:string;externalId:string;url:string;source:string};
type Observation = {at:Date; capability:FormCapability|null; providerId?:string};
export async function inspectRecruiteeOffer(url:string, fetcher:typeof fetch=fetch, at=new Date()):Promise<Observation> {
 const canonical=canonicalRecruiteeOffer(url); if(!canonical) return {at,capability:'unknown'};
 const u=new URL(canonical);
 try {
  const response=await fetcher(`${u.origin}/api/offers/${encodeURIComponent(u.pathname.split('/')[2])}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12_000),headers:{Accept:'application/json'}});
  if(response.status===404||response.status===410)return {at,capability:'closed'};
  if(!response.ok||!response.body)return {at,capability:null}; // transient: no freshness extension
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1_000_000){await reader.cancel();return {at,capability:null}}chunks.push(value)}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!body.offer||typeof body.offer!=='object')return {at,capability:'unknown'};
  const offer=body.offer as Record<string,unknown>;
  return {at,capability:offer.id==null?'unknown':classifyRecruiteeForm(offer),providerId:offer.id==null?undefined:String(offer.id)};
 }catch{return {at,capability:null}}
}
/** Updates existing metadata only. Lock + timestamp fence prevent stale concurrent evidence winning. */
export async function persistRecruiteeObservation(db:PrismaClient,target:Target,observation:Observation) {
 return db.$transaction(async tx=>{
  const canonical=canonicalRecruiteeOffer(target.url);
  if(!canonical){
   await tx.job.updateMany({where:{id:target.id,source:'recruitee',url:target.url,OR:[{catalogueCheckedAt:null},{catalogueCheckedAt:{lte:observation.at}}]},data:{catalogueCheckedAt:observation.at,publicationVerifiedAt:null,applicationFormCapability:'unknown'}});
   return 'invalid_origin';
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catalogue:${canonical}`}))`;
  const current=await tx.job.findUnique({where:{id:target.id},select:{source:true,url:true,externalId:true,catalogueCheckedAt:true}});
  if(!current||current.source!=='recruitee'||current.externalId!==target.externalId||canonicalRecruiteeOffer(current.url)!==canonical)return 'identity_changed';
  const duplicates=await tx.job.count({where:{source:'recruitee',OR:[{externalId:target.externalId},{url:{in:[canonical,canonical+'/']}}]}});
  if(duplicates!==1 || (observation.providerId!==undefined&&observation.providerId!==target.externalId)){
   await tx.job.updateMany({where:{source:'recruitee',AND:[{OR:[{externalId:target.externalId},{url:{in:[canonical,canonical+'/']}}]},{OR:[{catalogueCheckedAt:null},{catalogueCheckedAt:{lte:observation.at}}]}]},data:{catalogueCheckedAt:observation.at,publicationVerifiedAt:null,applicationFormCapability:'unknown'}});
   return 'collision';
  }
  const capability=observation.capability;
  const data=capability===null ? {catalogueCheckedAt:observation.at} : {
   catalogueCheckedAt:observation.at, applicationFormCapability:capability,
   publicationVerifiedAt:['standard','questions','unsupported'].includes(capability)?observation.at:null,
   ...(capability==='closed'?{closedAt:observation.at}:capability==='unknown'?{}:{closedAt:null,cachedAt:observation.at}),
  };
  const result=await tx.job.updateMany({where:{id:target.id,source:'recruitee',url:current.url,OR:[{catalogueCheckedAt:null},{catalogueCheckedAt:{lte:observation.at}}]},data});
  return result.count?capability??'transient':'stale_observation';
 },{timeout:5000});
}
export function refreshTenants(raw:string|undefined):string[] {
 const values=(raw??'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!values.length||values.length>64||values.some(x=>!/^[a-z0-9-]+$/.test(x)))throw Error('Explicit approved tenant list required (1–64)');
 return [...new Set(values)];
}
export async function refreshRecruiteeCatalogue(db:PrismaClient, options:{tenants:string[];limit?:number;budgetMs?:number;fetcher?:typeof fetch;discover?:boolean}) {
 const tenants=refreshTenants(options.tenants.join(','));
 const limit=options.limit??200,budget=options.budgetMs??210_000;
 if(!Number.isInteger(limit)||limit<1||limit>200||budget<1000||budget>210_000)throw Error('Invalid refresh bounds');
 const started=Date.now();const deadline=started+budget;
 // Reserve bounded discovery time when enabled so slow existing rows cannot
 // permanently starve new offers. Both phases share the same overall deadline.
 const refreshDeadline=options.discover&&budget>=50_000?deadline-35_000:deadline;
 const sourceWhere={source:'recruitee',NOT:{url:{startsWith:OWNED_TEST_PREFIX}},OR:tenants.map(t=>({url:{startsWith:`https://${t}.recruitee.com/o/`}}))};
 const targets=await db.job.findMany({where:sourceWhere,orderBy:[{catalogueCheckedAt:{sort:'asc',nulls:'first'}},{id:'asc'}],take:limit,select:{id:true,externalId:true,url:true,source:true}});
 let cursor=0;const counts:Record<string,number>={};
 async function worker(){while(cursor<targets.length&&Date.now()+13_000<refreshDeadline){const target=targets[cursor++];const observation=await inspectRecruiteeOffer(target.url,options.fetcher);const outcome=await persistRecruiteeObservation(db,target,observation);counts[outcome]=(counts[outcome]??0)+1;await new Promise(r=>setTimeout(r,600));}}
 await Promise.all([worker(),worker()]);
 const pending=await db.job.count({where:{AND:[sourceWhere,{OR:[{catalogueCheckedAt:null},{catalogueCheckedAt:{lt:new Date(Date.now()-6*60*60_000)}}]}]}});
 const staleStandard=await db.job.count({where:{AND:[sourceWhere,{applicationFormCapability:'standard',OR:[{publicationVerifiedAt:null},{publicationVerifiedAt:{lt:new Date(Date.now()-PUBLICATION_FRESH_MS)}}]}]}});
 const discovery=options.discover?await discoverRecruiteeCatalogue(db,{tenants,deadline,fetcher:options.fetcher}):null;
 return {selected:targets.length,processed:cursor,counts,pending,staleStandard,discovery,deadlineReached:cursor<targets.length,elapsedMs:Date.now()-started,requiresFollowup:pending>0||staleStandard>0||cursor<targets.length||!!counts.transient||!!counts.collision||!!discovery?.created};
}
