// Pure validation shared by popup and synthetic tests. No network or persistence.
export function parseProfile(raw) {
  if (raw.length > 8192) throw new Error('Profile file too large');
  const p = JSON.parse(raw);
  if (p?.version !== 1 || p?.purpose !== 'lavorai-contact-autofill') throw new Error('Unsupported profile file');
  const out = {};
  for (const key of ['name', 'email', 'phone']) {
    if (typeof p[key] !== 'string' || p[key].length > 200 || /[\x00-\x1f]/.test(p[key])) throw new Error('Invalid contact field');
    out[key] = p[key].trim();
  }
  if (!out.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Error('Name and email are required');
  return out;
}
export function supportedUrl(raw) {
  try {
    const u = new URL(raw);
    return u.origin === 'https://produzioneweb.recruitee.com' && !u.username && !u.password && !u.search && !u.hash && /^\/o\/lavorai-test-[a-z0-9-]+\/c\/new\/?$/.test(u.pathname);
  } catch { return false; }
}
// Serialized into Chrome's isolated world. Rechecks URL and DOM at fill time.
export function fillContacts(profile, expectedUrl, perform = false) {
  if (location.href !== expectedUrl || location.origin !== 'https://produzioneweb.recruitee.com' || !/^\/o\/lavorai-test-[a-z0-9-]+\/c\/new\/?$/.test(location.pathname) || location.search || location.hash || window.top !== window) return {error:'Page changed or unsupported site'};
  if (document.querySelector('iframe[src*="captcha"], .g-recaptcha, .h-captcha, input[type="password"]')) return {error:'Authentication or CAPTCHA requires your attention'};
  const mapped = {name:['candidate[name]','name'], email:['candidate[email]','email'], phone:['candidate[phone]','phone']};
  const fields = [];
  let form = null;
  for (const [key, names] of Object.entries(mapped)) {
    const matches = [...document.querySelectorAll('input')].filter(e => names.includes(e.name));
    if (matches.length !== 1) return {error:`Unsupported or ambiguous ${key} field`};
    const e = matches[0];
    if (!['text','email','tel'].includes(e.type) || e.disabled || e.readOnly || !e.getClientRects().length || !e.form) return {error:'Unsupported or hidden field'};
    if (form && form !== e.form) return {error:'Fields belong to different forms'};
    form = e.form;
    if (e.value.trim() && e.value !== profile[key]) return {error:'Existing values differ; review the form manually'};
    fields.push({key,e});
  }
  if (!perform) return {ready:true,fields:fields.filter(({key})=>profile[key]).map(({key})=>key)};
  for (const {key,e} of fields) {
    if (!profile[key] || e.value === profile[key]) continue;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,profile[key]);
    e.dispatchEvent(new Event('input',{bubbles:true}));
    e.dispatchEvent(new Event('change',{bubbles:true}));
  }
  return {filled:fields.filter(({key})=>profile[key]).map(({key})=>key), submitted:false};
}
