import assert from 'node:assert/strict';
import {portalRecipient} from '../src/lib/portal-recipient';
import {inboundReplyAddress,applicationIdFromInboundAddress} from '../src/lib/email';
const prior=process.env.INBOUND_EMAIL_DOMAIN;
try {
 process.env.INBOUND_EMAIL_DOMAIN='inbound.example.invalid';
 const alias=inboundReplyAddress('fixture_app_1');
 assert.equal(portalRecipient({userEmail:'owner@example.invalid',applicationAlias:alias,userInbox:'legacy@apply.example.invalid'}),alias);
 assert.equal(applicationIdFromInboundAddress(alias),'fixture_app_1');
 assert.equal(applicationIdFromInboundAddress('reply+fixture_app_1@evil.invalid'),null);
 assert.equal(portalRecipient({userEmail:'owner@example.invalid',applicationAlias:null,userInbox:'legacy@apply.example.invalid'}),'legacy@apply.example.invalid');
 assert.equal(portalRecipient({userEmail:'owner@example.invalid',applicationAlias:null,userInbox:null}),'owner@example.invalid');
 console.log('PASS exact application alias takes precedence, round-trip attribution, foreign-domain rejection and unchanged fallbacks; no Gmail account required');
} finally {if(prior===undefined)delete process.env.INBOUND_EMAIL_DOMAIN;else process.env.INBOUND_EMAIL_DOMAIN=prior;}
