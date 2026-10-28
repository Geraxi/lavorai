// Pure validation shared by popup and synthetic tests. No network or persistence.
export function parseProfile(raw) {
  if (raw.length > 262144) throw new Error('Profile file too large');
  const p = JSON.parse(raw);
  if (![1,2].includes(p?.version) || p?.purpose !== 'lavorai-contact-autofill') throw new Error('Unsupported profile file');
  const out = {};
  for (const key of ['name', 'email', 'phone']) {
    if (typeof p[key] !== 'string' || p[key].length > 200 || /[\x00-\x1f]/.test(p[key])) throw new Error('Invalid contact field');
    out[key] = p[key].trim();
  }
  if (!out.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Error('Name and email are required');
  out.cvFilename = typeof p.cvFilename === 'string' && p.cvFilename.length <= 255 ? p.cvFilename : '';
  out.experiences = [];
  if (p.version === 2) {
    if (!Array.isArray(p.experiences) || p.experiences.length > 30) throw new Error('Invalid work history');
    out.experiences = p.experiences.map(e => {
      const clean = {};
      for (const key of ['role','company','location','startDate','endDate','description']) {
        if (typeof e?.[key] !== 'string' || e[key].length > 2000) throw new Error('Invalid work history');
        clean[key] = e[key];
      }
      if (!Array.isArray(e.bullets) || e.bullets.length > 12 || e.bullets.some(b=>typeof b !== 'string'||b.length>300)) throw new Error('Invalid work history');
      clean.bullets = e.bullets;
      return clean;
    });
  }
  return out;
}
export function supportedUrl(raw) {
  try {
    const u = new URL(raw);
    return !u.username && !u.password && !u.search && !u.hash && ((u.origin === 'https://produzioneweb.recruitee.com' && /^\/o\/lavorai-test-[a-z0-9-]+\/c\/new\/?$/.test(u.pathname)) || (u.origin === 'https://optics11.recruitee.com' && u.pathname.replace(/\/$/,'') === '/o/senior-customer-experience-designer/c/new'));
  } catch { return false; }
}
// Serialized into Chrome's isolated world. Rechecks URL and DOM at fill time.
export function fillContacts(profile, expectedUrl, perform = false) {
  const owned = location.origin === 'https://produzioneweb.recruitee.com' && /^\/o\/lavorai-test-[a-z0-9-]+\/c\/new\/?$/.test(location.pathname);
  const optics = location.origin === 'https://optics11.recruitee.com' && location.pathname.replace(/\/$/,'') === '/o/senior-customer-experience-designer/c/new';
  if (location.href !== expectedUrl || !(owned || optics) || location.search || location.hash || window.top !== window) return {error:'Page changed or unsupported site'};
  // Contact-only assistance does not solve, dismiss or submit CAPTCHA. The known
  // Recruitee hidden hCaptcha frame remains mounted and untouched. Its internal
  // state is unknown; only this exact hidden integration is non-blocking here.
  const protections = [...document.querySelectorAll('iframe[src*="captcha"], .g-recaptcha, .h-captcha, input[type="password"]')];
  const knownHiddenFrame = e => {
    if (e.tagName !== 'IFRAME' || getComputedStyle(e).visibility !== 'hidden' || e.title !== 'Widget containing checkbox for hCaptcha security challenge') return false;
    if (e.parentElement?.tagName !== 'DIV' || !e.parentElement.id.startsWith('input-captchaToken-') || e.closest('form')?.id !== 'offer-application-form') return false;
    try {
      // Ignore the opaque fragment; do not interpret, log or modify CAPTCHA state.
      const u = new URL(e.src.split('#', 1)[0]);
      return u.origin === 'https://captcha-assets.recruiteecdn.com' && !u.username && !u.password && !u.search && /^\/captcha\/v1\/[a-zA-Z0-9._-]+\/static\/hcaptcha-enclave\.html$/.test(u.pathname);
    } catch { return false; }
  };
  if (protections.length > 1 || protections.some(e => !knownHiddenFrame(e))) return {error:'Authentication or CAPTCHA requires your attention'};
  const mapped = {name:['candidate.name'], email:['candidate.email'], phone:['candidate.phone']};
  const fields = [];
  let form = null;
  for (const [key, names] of Object.entries(mapped)) {
    const matches = [...document.querySelectorAll('input')].filter(e => names.includes(e.name));
    if (matches.length !== 1) return {error:`Unsupported or ambiguous ${key} field`};
    const e = matches[0];
    if (!['text','email','tel'].includes(e.type) || e.disabled || e.readOnly || !e.getClientRects().length || !e.form || e.form.id !== 'offer-application-form') return {error:'Unsupported or hidden field'};
    if (form && form !== e.form) return {error:'Fields belong to different forms'};
    form = e.form;
    if (e.value.trim() && e.value !== profile[key]) return {error:key === 'phone' ? 'Existing phone value differs (including a country-code prefix). Review and clear or correct it manually before filling; nothing was changed.' : 'Existing values differ; review the form manually'};
    fields.push({key,e});
  }
  const protectionNotice = protections.length ? 'Hidden hCaptcha remains active; its internal state is unknown. Complete any challenge manually before submission.' : '';
  if (!perform) return {ready:true,protectionNotice,fields:fields.filter(({key})=>profile[key]).map(({key})=>key)};
  for (const {key,e} of fields) {
    if (!profile[key] || e.value === profile[key]) continue;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,profile[key]);
    e.dispatchEvent(new Event('input',{bubbles:true}));
    e.dispatchEvent(new Event('change',{bubbles:true}));
  }
  return {protectionNotice,filled:fields.filter(({key})=>profile[key]).map(({key})=>key), submitted:false};
}
