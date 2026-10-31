import type {PrismaClient} from '@prisma/client';
import {fetchRecruiteeJobs} from './scrapers/recruitee';
import {canonicalRecruiteeOffer} from './recruitee-form-capability';
import {OWNED_TEST_PREFIX} from './job-catalogue-policy';
import {isProtectedCategoryJob} from './protected-category';

/** Discover only on the separately approved tenant list. Board evidence alone
 * never grants catalogue visibility: new rows still require the detail/form check.
 * Existing rows, application history and publication timestamps are untouched.
 */
export async function discoverRecruiteeCatalogue(db:PrismaClient, options:{tenants:string[];deadline:number;fetcher?:typeof fetch;now?:Date}) {
 const now=options.now??new Date();
 const tenants=[...new Set(options.tenants)].sort();
 if(!tenants.length||tenants.length>64||tenants.some(t=>!/^[a-z0-9-]+$/.test(t)))throw Error('Invalid approved tenants');
 // Rotate across scheduled four-hour runs without a new state table.
 const start=(Math.floor(+now/(4*60*60_000))*2)%tenants.length;
 const counts={boards:0,listed:0,created:0,existing:0,collision:0,invalid:0};
 for(let i=0;i<Math.min(2,tenants.length)&&Date.now()+16_000<options.deadline;i++){
  const tenant=tenants[(start+i)%tenants.length];
  const jobs=await fetchRecruiteeJobs(tenant,undefined,options.fetcher);counts.boards++;
  for(const job of jobs){
   if(counts.created>=100||Date.now()+1000>=options.deadline)break;
   counts.listed++;
   const url=canonicalRecruiteeOffer(job.url);
   if(!url||new URL(url).hostname!==`${tenant}.recruitee.com`||url.startsWith(OWNED_TEST_PREFIX)||!job.externalId||!job.title||!job.description|| (job.postedAt&&!Number.isFinite(+new Date(job.postedAt)))){counts.invalid++;continue;}
   const outcome=await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`catalogue:${url}`}))`;
    const rows=await tx.job.findMany({where:{source:'recruitee',OR:[{externalId:job.externalId},{url:{in:[url,url+'/']}}]},select:{externalId:true,url:true}});
    if(rows.length)return rows.length===1&&rows[0].externalId===job.externalId&&canonicalRecruiteeOffer(rows[0].url)===url?'existing':'collision';
    // createMany's unique guard also fences concurrent identical provider IDs
    // arriving with different slugs; never overwrite an identity collision.
    const result=await tx.job.createMany({skipDuplicates:true,data:[{
     externalId:job.externalId,source:'recruitee',sourceSlug:tenant,url,title:job.title,
     company:job.company,description:job.description,location:job.location,
     remote:job.remote,contractType:job.contractType,category:job.category,
     postedAt:job.postedAt,cachedAt:now,
     protectedCategory:isProtectedCategoryJob(job.title,job.description),
     publicationVerifiedAt:null,applicationFormCapability:null,catalogueCheckedAt:null,
    }]});
    return result.count?'created':'collision';
   },{timeout:5000});
   counts[outcome]++;
  }
 }
 return counts;
}
