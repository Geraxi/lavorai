import {reviewedOfferUrls} from '../src/lib/recruitee-catalogue-refresh';
import assert from 'node:assert/strict';
import type {Job} from '@prisma/client';
import {assistedOpportunity} from '../src/lib/assisted-opportunity';
import {catalogueJobVisible} from '../src/lib/job-catalogue-policy';
const now=new Date('2026-11-02T12:00:00Z');
const job={source:'recruitee',url:'https://example.recruitee.com/o/graphic-designer',title:'Graphic Designer',company:'Example',description:'Graphic design position in Milano',location:'Milano',remote:false,contractType:'employee',salaryMin:null,salaryMax:null,closedAt:null,applicationFormCapability:'questions',publicationVerifiedAt:now} as Job;
const p={roles:['Graphic Designer'],locations:['Milano'],employmentType:'employee',salaryMin:0,sourcesJson:'[]',avoidCompanies:null,seniority:null};
assert.equal(assistedOpportunity(job,p,now)?.canSubmit,false);
for(const changed of [{closedAt:now},{protectedCategory:true},{applicationFormCapability:'unknown'},{applicationFormCapability:'unsupported'},{publicationVerifiedAt:null},{publicationVerifiedAt:new Date(+now+1)},{publicationVerifiedAt:new Date(+now-86400001)},{url:'https://evil.test/o/graphic-designer'},{source:'lever'},{title:'Accountant'},{location:'Athens'},{url:'https://produzioneweb.recruitee.com/o/lavorai-test-example'}])assert.equal(assistedOpportunity({...job,...changed},p,now),null);
assert.equal(assistedOpportunity(job,{...p,avoidCompanies:'Example'},now),null);
assert.equal(assistedOpportunity(job,{...p,locations:[]},now),null);
process.env.APPLICATION_PROVIDER_POLICY='recruitee_only';process.env.APPLICATION_PROVIDER_NOT_BEFORE='2026-10-27T23:16:58.626Z';
assert.equal(catalogueJobVisible(job,now),false,'review does not admit question forms to automatic catalogue');
console.log('Assisted review policy: 16 checks passed; no DB/network/submission');

assert.deepEqual(reviewedOfferUrls('https://gtowizard.recruitee.com/o/graphic-designer'),['https://gtowizard.recruitee.com/o/graphic-designer']);
assert.deepEqual(reviewedOfferUrls('https://gtowizard.recruitee.com/o/graphic-designer,https://evil.test/x'),[]);
assert.deepEqual(reviewedOfferUrls(undefined),[]);
