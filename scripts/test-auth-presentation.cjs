const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base = process.env.AUTH_PREVIEW_URL || 'http://127.0.0.1:3017';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Only local previews are supported');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || await require('@sparticuz/chromium').executablePath(),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1536,height:864}});
 await context.addCookies([{name:'NEXT_LOCALE',value:'it',domain:new URL(base).hostname,path:'/'}]);
 await context.addInitScript(()=>localStorage.setItem('lavorai-cookie-consent','essential'));
 await context.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let data={};
  if(path.endsWith('/session')) data=null;
  if(path.endsWith('/csrf')) data={csrfToken:'preview-only'};
  if(path.endsWith('/providers')) data={password:{id:'password',type:'credentials'}};
  if(path.includes('/callback/password')) data={url:base+'/login?error=CredentialsSignin'};
  if(path.endsWith('/verify-email/status')) data={needsVerify:true};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage();
 const out=process.env.AUTH_PREVIEW_OUTPUT || '/tmp/lavorai-auth-preview';
 require('node:fs').mkdirSync(out,{recursive:true});
 for(const route of ['login','signup']) {
  await page.goto(base+'/'+route); await page.waitForTimeout(900);
  assert(await page.locator('h1').isVisible());
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${out}/${route}-desktop.png`,fullPage:true});
 }
 await page.locator('#email').fill('preview@example.test');
 await page.locator('#password').fill('Example123');
 await page.locator('#confirmPassword').fill('Different123');
 await page.locator('.auth-submit').click();
 await page.getByRole('alert').filter({hasText:'privacy'}).waitFor();
 await page.locator('input[type=checkbox]').check();
 await page.locator('.auth-submit').click();
 await page.getByRole('alert').filter({hasText:'non coincidono'}).waitFor();
 assert.equal(await page.locator('#confirmPassword').getAttribute('aria-invalid'),'true');
 await page.locator('.auth-password button').first().click();
 assert.equal(await page.locator('#password').getAttribute('type'),'text');
 await page.locator('.auth-password button').first().click();
 assert.equal(await page.locator('#password').getAttribute('type'),'password');
 await page.locator('#confirmPassword').fill('Example123');
 await page.locator('.auth-submit').click();
 await page.getByRole('heading',{name:'Ora controlla la posta.'}).waitFor();
 await page.screenshot({path:`${out}/signup-verification.png`,fullPage:true});
 await page.goto(base+'/login?plan=pro&error=1');
 await page.getByRole('heading',{name:'Pochi secondi per iniziare.'}).waitFor();
 await page.getByRole('alert').filter({hasText:'Link non valido'}).waitFor();
 await page.locator('#email').fill('preview@example.test');await page.locator('#password').fill('Example123');
 await page.locator('.auth-submit').click();await page.getByRole('button',{name:'Reinvia link di verifica'}).waitFor();
 await page.getByRole('button',{name:'Reinvia link di verifica'}).click();await page.getByRole('status').filter({hasText:'Email inviata'}).waitFor();
 for(const width of [390,320]) {
  await page.setViewportSize({width,height:844});
  for(const route of ['login','signup']) {
   await page.goto(base+'/'+route); await page.waitForTimeout(300);
   assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`${out}/${route}-mobile-${width}.png`,fullPage:true});
  }
 }
 await page.getByRole('button',{name:'English'}).click();
 await page.getByRole('heading',{name:'It starts with you.'}).waitFor();
 console.log('PASS: desktop/mobile layout; IT/EN; password visibility; invalid-link state; checkout heading; consent; mismatch; signup verification; login resend. APIs mocked, no real auth or external operations.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
