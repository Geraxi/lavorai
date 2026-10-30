import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadOwnedBrowserInput} from '../src/lib/local-workspace/owned-browser-input';
async function main(){
 let fileReads=0;let foreign=false;let started=false;
 const input={enabled:true,owner:'synthetic',applicationId:'fixture',documentId:'cv',leaseToken:'lease',expectedDocumentHash:createHash('sha256').update('%PDF-synthetic fixture').digest('hex')};
 const readers={application:async()=>({id:'fixture',userId:'synthetic',leaseToken:'lease',leaseExpiresAt:new Date(Date.now()+60000),submitStartedAt:started?new Date():null,completedAt:null}),profile:async()=>({userId:'synthetic',firstName:'Synthetic',lastName:'Alex',email:'alex@example.invalid',phone:null}),document:async()=>({id:'cv',userId:foreign?'other':'synthetic',originalFilename:'fixture.pdf',storagePath:'fixture-only'}),file:async()=>{fileReads++;return Buffer.from('%PDF-synthetic fixture');}};
 const result=await loadOwnedBrowserInput(input,readers);assert.equal(result.snapshot.owner,'synthetic');assert.equal(result.document.bytes.toString(),'%PDF-synthetic fixture');
 foreign=true;await assert.rejects(loadOwnedBrowserInput(input,readers),/Owned/);assert.equal(fileReads,1);foreign=false;
 started=true;await assert.rejects(loadOwnedBrowserInput(input,readers),/lease/);assert.equal(fileReads,1);started=false;
 await assert.rejects(loadOwnedBrowserInput({...input,leaseToken:'wrong'},readers),/lease/);
 await assert.rejects(loadOwnedBrowserInput({...input,enabled:false},readers),/disabled/);
 await assert.rejects(loadOwnedBrowserInput(input,{...readers,file:async()=>{started=true;return Buffer.from('%PDF-synthetic fixture');}}),/lease/);
 await assert.rejects(loadOwnedBrowserInput(input,{...readers,application:async()=>({...await readers.application(),id:'other'})}),/lease/);
 started=false;await assert.rejects(loadOwnedBrowserInput(input,{...readers,document:async()=>({...await readers.document(),id:'other'})}),/Owned/);
 await assert.rejects(loadOwnedBrowserInput({...input,expectedDocumentHash:'wrong'},readers),/changed/);
 console.log('PASS synthetic owned readers: ownership before file read, exact bytes/hash, lease fence before/after read, disabled and uncertain-submit rejection');
}
void main();
