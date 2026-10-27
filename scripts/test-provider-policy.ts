import assert from 'node:assert/strict';
import {providerOfferAllowed,providerApplicationAllowed,providerChannelAllowed} from '../src/lib/application-provider-policy';
import {recruiteeBooleanAnswer} from '../src/lib/portal-adapters/recruitee';
const env={APPLICATION_PROVIDER_POLICY:'recruitee_only',APPLICATION_PROVIDER_NOT_BEFORE:'2026-10-27T15:00:00.000Z'};
const url='https://employer.recruitee.com/o/engineer';
assert.equal(providerOfferAllowed(url,env),true);
for(const bad of ['https://recruitee.com.evil.test/o/engineer','https://employer.test/o/engineer','http://employer.recruitee.com/o/engineer','https://employer.recruitee.com/o/engineer?redirect=bad','https://x@employer.recruitee.com/o/engineer'])assert.equal(providerOfferAllowed(bad,env),false);
for(const bad of [{...env,APPLICATION_PROVIDER_NOT_BEFORE:''},{...env,APPLICATION_PROVIDER_POLICY:'all'}, {...env,APPLICATION_PROVIDER_NOT_BEFORE:'invalid'}])assert.equal(providerOfferAllowed(url,bad),false);
assert.equal(providerApplicationAllowed({job:{url},createdAt:new Date('2026-10-27T14:59:59Z')},env),false);
assert.equal(providerApplicationAllowed({job:{url},createdAt:new Date('2026-10-27T15:00:01Z')},env),true);
for(const channel of ['email_recruiter','portal_greenhouse','portal_web','', 'portal_recruitee'])assert.equal(providerChannelAllowed(channel,env),channel==='portal_recruitee');
assert.equal(providerOfferAllowed('https://other.test',{}),true,'unset retains existing behavior');
for(const text of ['unknown','not sure','sometimes','yes but only remotely','no idea',''])assert.equal(recruiteeBooleanAnswer(text),null);
for(const text of ['Yes',' sì ','true','1'])assert.equal(recruiteeBooleanAnswer(text),true);
for(const text of ['No',' false ','0'])assert.equal(recruiteeBooleanAnswer(text),false);
console.log('PASS provider policy: strict origin/channel, cutoff, malformed fail-closed; ambiguous boolean requires user answer');

async function mailboxFence() {
  const {sendApprovedMailbox} = await import('../src/lib/mailbox/service');
  const forbidden = new Proxy({}, {get(){throw Error('blocked mailbox must not touch storage or provider')}});
  assert.equal(await sendApprovedMailbox('fixture','owner',{env,db:forbidden} as never,{live:true}),'skipped');
  const {recruiterEmailFallbackEnabled} = await import('../src/lib/recruiter-email-fallback');
  assert.equal(recruiterEmailFallbackEnabled({...env,RECRUITER_EMAIL_FALLBACK_ENABLED:'true'}),false);
}
mailboxFence().then(()=>console.log('PASS restriction fences direct mailbox and employer-email fallback')).catch(e=>{console.error(e);process.exitCode=1});
