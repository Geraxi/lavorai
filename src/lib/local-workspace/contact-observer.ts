import type { Page } from 'playwright';

type Field = 'name' | 'email' | 'phone';
export type ContactSnapshot = {
  owner: string;
  facts: Partial<Record<Field, { value: string; provenance: string }>>;
};
/** Stagehand-compatible observation shape. Arguments are deliberately never used. */
export type Observation = { selector: string; method: string; arguments?: unknown[] };
export type FieldObserver = (page: Page, field: Field) => Promise<Observation[]>;
type Guard = () => { owner: string; revision: number; controller: 'agent' | 'human'; terminal: boolean };

/** Local-only seam. An observer proposes a target; trusted facts and Playwright own writes. */
export async function fillObservedContact(input: {
  enabled: boolean; page: Page; owner: string; revision: number;
  snapshot: ContactSnapshot; field: Field; observe: FieldObserver; guard: Guard;
}) {
  const { page, field } = input;
  const check = () => {
    const state = input.guard();
    if (!input.enabled || process.env.NODE_ENV === 'production' ||
        !/^https:\/\/compatibility\.invalid\/(lever|greenhouse|ashby)$/.test(page.url()) ||
        state.owner !== input.owner || input.snapshot.owner !== input.owner ||
        state.revision !== input.revision || state.controller !== 'agent' || state.terminal) {
      throw Error('Observation control unavailable');
    }
  };
  check();
  const selected = input.snapshot.facts[field];
  const fact = selected ? {value:selected.value,provenance:selected.provenance} : undefined;
  if (!fact?.value.trim() || !fact.provenance.trim()) return { status: 'needs_answer' as const, field };
  const suggestions = await input.observe(page, field);
  check();
  if (suggestions.length !== 1 || suggestions[0].method !== 'fill') throw Error('Ambiguous or unsupported observation');
  const target = page.locator(suggestions[0].selector);
  if (await target.count() !== 1 || !await target.isVisible() || !await target.isEditable()) throw Error('Target unavailable');
  // autocomplete is a deterministic semantic anchor, not a model assertion.
  const allowed = await target.evaluate((el, expected) => el instanceof HTMLInputElement &&
    el.autocomplete === (expected === 'phone' ? 'tel' : expected) &&
    (expected === 'email' ? el.type === 'email' : expected === 'phone' ? el.type === 'tel' : el.type === 'text'), field);
  if (!allowed) throw Error('Target semantics do not match');
  const element=await target.elementHandle();
  if(!element)throw Error('Target unavailable');
  const current = await target.inputValue();
  if (current && current !== fact.value) throw Error('Existing value requires review');
  check();
  const written=await element.evaluate((el,{field,current,value})=>{
    if(!(el instanceof HTMLInputElement)||!el.isConnected||el.value!==current||el.disabled||el.readOnly||
      el.autocomplete!==(field==='phone'?'tel':field)||el.type!==(field==='email'?'email':field==='phone'?'tel':'text')||
      !el.getClientRects().length||getComputedStyle(el).visibility!=='visible')return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    return el.isConnected&&el.value===value;
  },{field,current,value:fact.value});
  if(!written||await target.count()!==1||!await target.evaluate((el,value)=>el instanceof HTMLInputElement&&el.value===value,fact.value)||
     !await element.evaluate(el=>el.isConnected))throw Error('Field changed; review required');
  return { status: 'filled' as const, field, provenance: fact.provenance };
}

/** Preferred discovery for explicit HTML contact semantics; no model or inferred facts. */
export const knownContactObserver:FieldObserver=async(page,field)=>{
 const autocomplete=field==='phone'?'tel':field;
 const type=field==='email'?'email':field==='phone'?'tel':'text';
 const selector=field==='name'?`input[autocomplete="${autocomplete}"]:is([type="text"],:not([type]))`:`input[autocomplete="${autocomplete}"][type="${type}"]`;
 const target=page.locator(selector);
 return await target.count()===1?[{selector,method:'fill'}]:[];
};
