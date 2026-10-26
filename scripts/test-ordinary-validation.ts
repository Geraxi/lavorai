import assert from 'node:assert/strict';
import { ordinaryValidationConfig, ordinaryValidationDestination } from '../src/lib/ordinary-validation';
import { applicationsPaused } from '../src/lib/application-pause';
const now=new Date();
const env={APPLICATIONS_PAUSED:'true',USER_NOTIFICATIONS_HOLD:'true',ATS_TEST_REAL_SUBMIT:'false',
 ORDINARY_VALIDATION_APPLICATION_ID:'one',ORDINARY_VALIDATION_USER_ID:'owner',ORDINARY_VALIDATION_USER_EMAIL:'owner@example.test',
 ORDINARY_VALIDATION_JOB_ID:'job',ORDINARY_VALIDATION_RECIPIENT:'owner@example.test',
 ORDINARY_VALIDATION_OFFER_URL:'https://owned.recruitee.com/o/ordinary-validation',
 ORDINARY_VALIDATION_STARTED_AT:new Date(+now-1000).toISOString(),ORDINARY_VALIDATION_EXPIRES_AT:new Date(+now+60_000).toISOString()};
assert.ok(ordinaryValidationConfig(env,now));
for(const key of Object.keys(env)) assert.equal(ordinaryValidationConfig({...env,[key]:''},now),null,key);
for(const patch of [{APPLICATIONS_PAUSED:'false'},{USER_NOTIFICATIONS_HOLD:'false'},{ATS_TEST_REAL_SUBMIT:'true'},
 {ORDINARY_VALIDATION_EXPIRES_AT:new Date(+now-1).toISOString()},
 {ORDINARY_VALIDATION_EXPIRES_AT:new Date(+now+31*60_000).toISOString()},
 {ORDINARY_VALIDATION_STARTED_AT:new Date(+now+1000).toISOString()},
 {ORDINARY_VALIDATION_OFFER_URL:'https://example.test/o/ordinary-validation'},
 {ORDINARY_VALIDATION_OFFER_URL:'https://owned.recruitee.com/o/ordinary-validation?redirect=evil'},
 {ORDINARY_VALIDATION_RECIPIENT:'a@example.test,b@example.test'}]) assert.equal(ordinaryValidationConfig({...env,...patch},now),null);
Object.assign(process.env,env);
assert.equal(applicationsPaused(),true);
assert.equal(ordinaryValidationDestination('one','recruitee',env.ORDINARY_VALIDATION_OFFER_URL,'owner@example.test'),true);
for(const args of [['other','recruitee',env.ORDINARY_VALIDATION_OFFER_URL,'owner@example.test'],
 ['one','greenhouse',env.ORDINARY_VALIDATION_OFFER_URL,'owner@example.test'],
 ['one','recruitee','https://other.recruitee.com/o/ordinary-validation','owner@example.test'],
 ['one','recruitee',env.ORDINARY_VALIDATION_OFFER_URL,'other@example.test']]) assert.equal(ordinaryValidationDestination(...args as [string,string,string,string]),false);
process.env.APPLICATIONS_PAUSED='false'; assert.equal(applicationsPaused(),true); assert.equal(ordinaryValidationConfig(),null);
console.log('PASS ordinary validation: exact scope, expiry, invalid config and accidental unpause fail closed');
