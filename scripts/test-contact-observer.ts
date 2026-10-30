import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fillObservedContact, type Observation } from '../src/lib/local-workspace/contact-observer';

async function main() {
 const browser = await chromium.launch({headless:true});
 try {
  const context = await browser.newContext({serviceWorkers:'block'});
  let external = 0, posts = 0;
  await context.route('**/*', r => {
   if (r.request().method() !== 'GET') { posts++; return r.abort(); }
   if (r.request().url() !== 'https://compatibility.invalid/lever') { external++; return r.abort(); }
   return r.fulfill({contentType:'text/html',body:'<input id="name" autocomplete="name"><input id="email" type="email" autocomplete="email"><input id="phone" type="tel" autocomplete="tel"><input id="consent" type="checkbox"><button>Submit</button>'});
  });
  const page = await context.newPage(); await page.goto('https://compatibility.invalid/lever');
  const state = {owner:'synthetic-owner',revision:1,controller:'agent' as 'agent'|'human',terminal:false};
  let suggestions: Observation[] = [{selector:'#name',method:'fill',arguments:['UNTRUSTED VALUE']}];
  const base = {enabled:true,page,owner:state.owner,revision:1,snapshot:{owner:state.owner,facts:{name:{value:'Synthetic Alex',provenance:'Approved synthetic profile'}}},field:'name' as const,guard:()=>state,observe:async()=>suggestions};
  await fillObservedContact(base); assert.equal(await page.locator('#name').inputValue(),'Synthetic Alex');
  await assert.rejects(fillObservedContact({...base,owner:'other'}),/unavailable/);
  await assert.rejects(fillObservedContact({...base,enabled:false}),/unavailable/);
  suggestions=[{selector:'#consent',method:'fill'}]; await assert.rejects(fillObservedContact(base),/semantics/);
  suggestions=[{selector:'button',method:'click'}]; await assert.rejects(fillObservedContact(base),/unsupported/);
  suggestions=[{selector:'input',method:'fill'}]; await assert.rejects(fillObservedContact(base),/unavailable/);
  suggestions=[{selector:'#name',method:'fill'},{selector:'#email',method:'fill'}]; await assert.rejects(fillObservedContact(base),/Ambiguous/);
  suggestions=[{selector:'#email',method:'fill'}]; await assert.rejects(fillObservedContact(base),/semantics/);
  suggestions=[{selector:'#name',method:'fill'}];
  await page.locator('#name').fill('Existing personal value'); await assert.rejects(fillObservedContact(base),/requires review/);
  await assert.rejects(fillObservedContact({...base,observe:async()=>{state.revision++;return suggestions;}}),/unavailable/);
  state.revision=1;state.controller='human';await assert.rejects(fillObservedContact(base),/unavailable/);state.controller='agent';
  const missing=await fillObservedContact({...base,snapshot:{owner:state.owner,facts:{}}});assert.equal(missing.status,'needs_answer');
  await page.locator('#name').fill('');const mutable={owner:state.owner,facts:{name:{value:'Original approved',provenance:'Approved'}}};
  await fillObservedContact({...base,snapshot:mutable,observe:async()=>{mutable.facts.name.value='Unreviewed changed';return suggestions;}});
  assert.equal(await page.locator('#name').inputValue(),'Original approved');
  for(const race of ['replace','value','reactive'] as const){
   await page.locator('#name').fill('');let checks=0;let mutation:Promise<unknown>|undefined;
   if(race==='reactive')await page.locator('#name').evaluate(el=>el.addEventListener('input',()=>{(el as HTMLInputElement).value='';},{once:true}));
   await assert.rejects(fillObservedContact({...base,guard:()=>{checks++;if(checks===3&&race!=='reactive')mutation=page.locator('#name').evaluate((el,mode)=>{if(mode==='replace')el.replaceWith(el.cloneNode(true));else (el as HTMLInputElement).value='Human edit';},race);return state;}}),/changed/);
   await mutation;
  }
  assert.equal(posts,0);assert.equal(external,0);assert.equal(await page.locator('#consent').isChecked(),false);
  console.log('PASS observed contact: trusted facts, ownership, stale control, unique semantic targets, no overwrite/consent/POST/external traffic');
 } finally {await browser.close();}
}
void main();
