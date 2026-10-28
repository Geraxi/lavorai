import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PrismaClient} from '@prisma/client';
import {persistRecruiteeObservation,refreshRecruiteeCatalogue} from '../src/lib/recruitee-catalogue-refresh';
import {catalogueWhere,catalogueJobVisible,PUBLICATION_FRESH_MS} from '../src/lib/job-catalogue-policy';
async function main(){
 const url=new URL(process.env.CATALOGUE_TEST_DATABASE_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/lavorai_catalogue_test');
 process.env.DATABASE_URL=url.href;process.env.DIRECT_URL=url.href;
 process.env.APPLICATION_PROVIDER_POLICY='recruitee_only';process.env.APPLICATION_PROVIDER_NOT_BEFORE='2026-10-27T23:16:58.626Z';
 const db=new PrismaClient();
 try{
 const tables=await db.$queryRawUnsafe<{count:bigint}[]>("SELECT count(*) FROM pg_tables WHERE schemaname='public'");assert.equal(Number(tables[0].count),0,'refuse nonempty DB');
 execFileSync(process.execPath,[resolve('node_modules/prisma/build/index.js'),'db','push','--skip-generate'],{env:process.env,stdio:'inherit'});
 await db.$executeRawUnsafe('ALTER TABLE "Job" DROP COLUMN "publicationVerifiedAt", DROP COLUMN "applicationFormCapability", DROP COLUMN "catalogueCheckedAt"');
 await db.$executeRawUnsafe(readFileSync('prisma/migrations/20261028003000_job_publication_check/migration.sql','utf8'));
 const now=new Date();
 for(const [id,patch] of Object.entries({a:{},b:{},c:{},testOffer:{url:'https://produzioneweb.recruitee.com/o/lavorai-test-fixture'},questions:{applicationFormCapability:'questions',description:'Employer requires answers; visibility is not eligibility.'},other:{source:'lever'},closed:{closedAt:now},stale:{publicationVerifiedAt:new Date(+now-PUBLICATION_FRESH_MS-1)},unknown:{publicationVerifiedAt:null}})){
 await db.job.create({data:{id,externalId:id,source:'recruitee',title:'Developer',description:'Fixture',url:'https://owned.recruitee.com/o/'+id,publicationVerifiedAt:now,applicationFormCapability:'standard',...patch}});
 }
 const where=catalogueWhere(now);assert.equal(await db.job.count({where}),3);
 const first=await db.job.findMany({where,orderBy:{id:'asc'},take:2});const second=await db.job.findMany({where,orderBy:{id:'asc'},skip:2,take:2});
 assert.deepEqual([...first,...second].map(j=>j.id),['a','b','c']);assert.equal(first.length,2);assert.equal(second.length,1);
 assert.equal(await db.job.count(),9,'hidden rows are preserved');assert.equal(catalogueJobVisible((await db.job.findUniqueOrThrow({where:{id:'other'}})),now),false);

 const target={id:'a',externalId:'a',source:'recruitee',url:'https://owned.recruitee.com/o/a'};
 const t=(offset:number)=>new Date(+now+offset);
 assert.equal(await persistRecruiteeObservation(db,target,{at:t(1),capability:'closed'}),'closed');
 assert.equal(await db.job.count({where:catalogueWhere(t(1))}),2,'authoritative closure immediately hidden');
 assert.equal(await persistRecruiteeObservation(db,target,{at:now,capability:'standard',providerId:'a'}),'stale_observation');
 await Promise.all([persistRecruiteeObservation(db,target,{at:t(2),capability:'standard',providerId:'a'}),persistRecruiteeObservation(db,target,{at:t(3),capability:'unsupported',providerId:'a'})]);
 assert.equal((await db.job.findUniqueOrThrow({where:{id:'a'}})).applicationFormCapability,'unsupported','newest request evidence wins race');
 await persistRecruiteeObservation(db,target,{at:t(4),capability:'standard',providerId:'a'});
 await persistRecruiteeObservation(db,target,{at:t(5),capability:null});
 assert.equal(+(await db.job.findUniqueOrThrow({where:{id:'a'}})).publicationVerifiedAt!,+t(4),'transient failure cannot extend TTL');
 assert.equal(await db.job.count({where:catalogueWhere(t(PUBLICATION_FRESH_MS+6))}),0,'outage expires visibility');
 await db.job.create({data:{id:'duplicate',externalId:'different',source:'recruitee',url:target.url+'/',title:'fixture',description:'fixture'}});
 assert.equal(await persistRecruiteeObservation(db,target,{at:t(6),capability:'standard',providerId:'a'}),'collision');
 assert.equal(await db.job.count({where:{url:{in:[target.url,target.url+'/']},applicationFormCapability:'standard'}}),0,'both canonical duplicates quarantined');
 let providerCalls=0;
 const fake:typeof fetch=async(_url,init)=>{assert.equal(init?.method,'GET');providerCalls++;return new Response('{}',{status:429})};
 const run=await refreshRecruiteeCatalogue(db,{tenants:['owned'],limit:2,fetcher:fake});assert.equal(run.processed,2);assert.equal(providerCalls,2);assert.equal(run.counts.transient,2);
 const secondRun=await refreshRecruiteeCatalogue(db,{tenants:['owned'],limit:2,fetcher:fake});assert.equal(secondRun.processed,2);
 assert.equal(await db.job.count({where:{catalogueCheckedAt:{not:null}}}),6,'oldest-attempt ordering advances beyond transient failures');
 assert.equal(await db.job.count(),10,'refresh never creates or deletes rows');
 const short=await refreshRecruiteeCatalogue(db,{tenants:['owned'],limit:2,budgetMs:1000,fetcher:fake});assert.equal(short.processed,0);assert.equal(short.deadlineReached,true);
 const invalid=await db.job.create({data:{id:'invalid-url',externalId:'invalid-url',source:'recruitee',url:'https://owned.recruitee.com/o/a?redirect=bad',title:'fixture',description:'fixture'}});
 assert.equal(await persistRecruiteeObservation(db,invalid,{at:new Date(),capability:'unknown'}),'invalid_origin');
 assert.ok((await db.job.findUniqueOrThrow({where:{id:invalid.id}})).catalogueCheckedAt,'invalid URLs cannot pin the refresh queue forever');
 process.env.APPLICATION_PROVIDER_POLICY='invalid';assert.equal(await db.job.count({where:catalogueWhere(now)}),0);
 console.log('PASS actual additive migration; SQL filtering before pagination/count; mixed/closed/stale/unknown hidden, questionnaire hidden from in-app catalogue; no deletes or external providers');
 }finally{await db.$disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
