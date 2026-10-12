# Card trial copy audit (pre-change inventory)

The rollout is disabled by default. Do not globally replace legacy strings before rollout: public pricing must reflect the offer actually available, while existing subscribers must retain their original terms. Use the same rollout availability helper for public new-signup copy and the immutable cohort helper for authenticated copy. The inventory below records the original source before implementation. Rollout-aware public, membership, onboarding and lifecycle changes are now implemented; see card-trial-rollout.md for tested scope and remaining release checks.

## Required new-cohort wording

- IT short: “Prova di 3 giorni con carta. Un CV e una lettera su misura per un’offerta scelta da te. Nessuna candidatura durante la prova.”
- EN short: “3-day trial with a card. One tailored CV and cover letter for a job you choose. No applications during the trial.”
- IT renewal: “Poi €19,99/mese con Pro o €39,99/mese con Pro+. Rinnovo automatico; annulla prima della scadenza per evitare l’addebito. Le candidature e le altre funzioni AI si attivano dopo il primo pagamento riuscito.”
- EN renewal: “Then €19.99/month for Pro or €39.99/month for Pro+. Renews automatically; cancel before the trial ends to avoid a charge. Applications and other AI features unlock after the first successful payment.”
- IT CTA: “Attiva la prova di 3 giorni” / EN CTA: “Start the 3-day trial”.
- Anonymous optimize/interview claims: remove promises of three free runs if those endpoints are gated. Instead: IT “Scopri l’anteprima inclusa nella prova” / EN “Explore the preview included in the trial”. Interview AI is not part of the trial, so its CTA must lead to plan information rather than promise access.
- Terms page must explain trial start at verified card checkout, renewal amount and timing, cancellation, one saved preview, no sends before paid invoice, and unchanged existing-cohort terms. Legal review is required before publication.

## Original public/authenticated claim locations

Every line below is a source match, not an approved new promise. Exclude ordinary analytics date ranges. Replace trial length/card claims with the short wording plus the renewal disclosure nearby. Use cohort-aware rendering for authenticated screens.

- `messages/en.json:35`: `"ctaCaption": "7-day Pro trial · no card · pause anytime",`
- `messages/en.json:57`: `"checkB": "No automatic renewal",`
- `messages/en.json:240`: `"subtitle": "Try the service for 7 days from signup, with up to 5 applications a day. No card; then you decide whether to continue.",`
- `messages/en.json:312`: `"paywallTitle": "You've used your 3 free mock interviews",`
- `messages/en.json:319`: `"badge": "Free · 60 seconds · no card",`
- `messages/en.json:325`: `"caption": "No signup · 3 free audits · GDPR-first",`
- `messages/en.json:362`: `"subtitle": "Upload your CV and a posting. We rewrite your CV and cover letter in 60 seconds, free, no card.",`
- `messages/en.json:363`: `"cta": "Try now · 3 free audits",`
- `messages/en.json:419`: `"cta": "Start free. 7 days of Pro"`
- `messages/en.json:508`: `"signupSubheading": "Create your account and your 7-day trial starts immediately, with up to 5 applications a day. No card and no automatic renewal.",`
- `messages/en.json:560`: `"loginBenefit3": "7 days of Pro free to try — no card",`
- `messages/it.json:35`: `"ctaCaption": "7 giorni di Pro gratis · niente carta · pausa quando vuoi",`
- `messages/it.json:240`: `"subtitle": "Prova il servizio per 7 giorni dalla registrazione, fino a 5 candidature al giorno. Senza carta, poi scegli tu se continuare.",`
- `messages/it.json:243`: `"riskReducer2": "La prova senza carta non si rinnova",`
- `messages/it.json:325`: `"caption": "Niente registrazione · 3 audit gratuiti · GDPR-first",`
- `messages/it.json:362`: `"subtitle": "Carica il tuo CV e un annuncio. Ti riscriviamo CV e cover letter in 60 secondi, gratis, niente carta.",`
- `messages/it.json:363`: `"cta": "Prova ora · 3 audit gratuiti",`
- `messages/it.json:419`: `"cta": "Inizia gratis. 7 giorni di Pro"`
- `messages/it.json:508`: `"signupSubheading": "Crea l'account e iniziano subito i tuoi 7 giorni di prova, fino a 5 candidature al giorno. Niente carta, niente rinnovo automatico.",`
- `messages/it.json:560`: `"loginBenefit3": "7 giorni di Pro gratis per provare — no carta",`
- `src/app/layout.tsx:66`: `"Invia CV in automatico a 50 lavori al mese. LavorAI adatta CV e lettera a ogni annuncio e compila i form ATS. La prova Pro di 7 giorni parte dalla registrazione, fino a 5 candidature al giorno, senza carta e senza rinnovo automatico.",`
- `src/app/layout.tsx:91`: `"50 candidature al mese, con CV e lettera su misura. Prova Pro per 7 giorni dalla registrazione, senza carta e senza rinnovo automatico.",`
- `src/app/layout.tsx:97`: `"50 candidature/mese automatiche. CV e lettera su misura. Prova di 7 giorni dalla registrazione, fino a 5 candidature al giorno, senza carta.",`
- `src/app/trial-expired/page.tsx:24`: `<p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">La prova Pro di 7 giorni è terminata. Attiva Pro per far ripartire la ricerca, le candidature su misura e il monitoraggio delle risposte.</p>`
- `src/app/trial-expired/page.tsx:32`: `<li>• Nessuna carta o vincolo nascosto: disdici quando vuoi</li>`
- `src/app/start-membership/page.tsx:29`: `const date = endsAt?.toLocaleDateString("it-IT", { day: "numeric", month: "long" }) ?? "tra 7 giorni";`
- `src/app/start-membership/page.tsx:50`: `<div className="border-l border-white/10 py-4 pl-4"><span className="block font-mono text-xs text-emerald-300">02 · PROVA</span><span className="mt-1 block">7 giorni di Pro</span></div>`
- `src/app/start-membership/page.tsx:57`: `<span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">7 giorni gratis</span>`
- `src/app/start-membership/start-membership-actions.tsx:47`: `<span><span className="block text-base font-bold">{busy === "pro" ? "Apro Stripe…" : "Inizia 7 giorni di Pro"}</span><span className="mt-1 block text-sm text-slate-800">Poi €19,99/mese · 50 candidature/mese</span></span>`
- `src/app/start-membership/start-membership-actions.tsx:51`: `<span><span className="block text-base font-semibold">{busy === "pro_plus" ? "Apro Stripe…" : "Inizia 7 giorni di Pro+"}</span><span className="mt-1 block text-sm text-slate-400">Poi €39,99/mese · candidature illimitate</span></span>`
- `src/app/(marketing)/auto-candidatura/page.tsx:20`: `"Cerchi un software per candidarti automaticamente ai lavori? LavorAI invia CV + lettera motivazionale AI a 50 offerte/mese al posto tuo. 7 giorni di Pro gratis, senza carta. Provalo in 2 minuti.",`
- `src/app/(marketing)/auto-candidatura/page.tsx:25`: `"Il primo software italiano che invia CV in automatico a 50 lavori al mese. 7 giorni di Pro gratis, senza carta.",`
- `src/app/(marketing)/auto-candidatura/page.tsx:127`: `✓ Pro completo per 7 giorni · ✓ Fino a 5 candidature al giorno · ✓ La prova parte dalla registrazione`
- `src/app/(marketing)/auto-candidatura/page.tsx:279`: `a: "La prova Pro dura 7 giorni dalla registrazione, senza carta e senza rinnovo automatico. Poi Pro costa €19,99/mese per 50 candidature e Pro+ €39,99/mese per candidature illimitate, coda prioritaria e Founder Coach. Disdici quando vuoi.",`
- `src/app/(marketing)/auto-candidatura/page.tsx:346`: `7 giorni di Pro completo dalla registrazione, senza carta di`
- `src/app/(marketing)/auto-candidatura/page.tsx:347`: `credito e senza rinnovo automatico. Se non ti convince, non paghi nulla.`
- `src/app/(marketing)/optimize/layout.tsx:6`: `"Carica il tuo CV. OpenAI lo riscrive sull'annuncio, lo allinea ai keyword ATS, te lo manda via email. 3 audit gratuiti, niente registrazione.",`
- `src/app/(marketing)/optimize/page.tsx:140`: `Inizia gratis — 7 giorni di Pro`
- `src/app/(marketing)/optimize/page.tsx:145`: `I tuoi 7 giorni di Pro partono dalla registrazione, senza carta e senza rinnovo automatico.`
- `src/app/(marketing)/optimize/page.tsx:251`: `7 giorni di Pro gratis, poi €19.99/mese. Nessuna carta richiesta per`
- `src/app/(marketing)/termini/page.tsx:139`: `LavorAI offre una prova Pro gratuita di 7 giorni, senza carta e`
- `src/app/(marketing)/termini/page.tsx:140`: `senza rinnovo automatico, che inizia quando crei il tuo account.`
- `src/app/(marketing)/pricing/page.tsx:10`: `"Prova Pro 7 giorni senza carta. Poi Pro a €19,99/mese per 50 candidature o Pro+ a €39,99/mese con candidature illimitate e Founder Coach.",`
- `src/app/(marketing)/guide/page.tsx:84`: `<p>CV riscritto per ogni annuncio, form compilati su Greenhouse, Lever, Ashby e Workable, prova di consegna. 7 giorni di Pro gratis.</p>`
- `src/app/(marketing)/lavoro/[id]/page.tsx:117`: `<p>LavorAI adatta il tuo CV all&apos;annuncio, scrive la lettera di presentazione e compila il form dell&apos;azienda per te. Prova gratis, senza carta.</p>`
- `src/app/(app)/settings/page.tsx:143`: `? ’Prova gratuita attiva fino al ${trial.endsAt.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}: fino a 5 candidature al giorno, CV e lettera su misura. Nessuna carta registrata. Alla scadenza l'account passa in pausa.’`
- `src/app/(app)/dashboard/loading.tsx:64`: `{/* 7-day mini bar chart */}`
- `src/components/trial-banner.tsx:7`: `* Striscia discreta sotto la topbar durante la prova Pro senza carta.`
- `src/components/trial-banner.tsx:61`: `{last ? ’Scade il ${ends}. Poi il tuo account resta in pausa finché non scegli Pro.’ : needsSetup ? ’Completa CV e preferenze per iniziare: fino a 5 candidature al giorno nella prova, attiva fino al ${ends}.’ : ’Fino al ${ends} LavorAI invia fino a 5 candidature al giorno. Nessuna carta richiesta.’}`
- `src/components/upgrade-prompt.tsx:193`: `body: "Prova Pro: 7 giorni dalla registrazione, fino a 5 candidature al giorno, senza carta. Poi 50 candidature/mese, priorità sui portali supportati e cover letter personalizzata a €19,99/mese. Disdici quando vuoi.",`
- `src/components/sections/pricing.tsx:49`: `tagline: "7 days of Pro from signup, up to 5 applications a day. No card and no automatic renewal.",`
- `src/components/sections/pricing.tsx:52`: `cta: "Try Pro free for 7 days",`
- `src/components/sections/pricing.tsx:66`: `cta: "Try 7 days free",`
- `src/components/sections/pricing.tsx:81`: `cta: "Try 7 days free",`

## Legacy lifecycle copy: preserve with cohort-specific routing

Do not mass-replace these strings. Existing users keep the historical seven-day/no-card lifecycle where applicable. Exclude new-cohort users from legacy lifecycle sends and give the new flow its own card/preview/renewal wording.

- `src/lib/trial.ts:11`: `* Prova Pro gratuita senza carta: parte alla registrazione.`
- `src/lib/trial.ts:41`: `preheader: en ? ’Up to 5 applications per day during the trial until ${ends}. No card needed.’ : ’Fino a 5 candidature al giorno nella prova fino al ${ends}. Nessuna carta richiesta.’,`
- `src/lib/trial.ts:43`: `? en ? "We turned on Pro for you, for 7 days" : "Ti abbiamo attivato Pro per 7 giorni"`
- `src/lib/trial.ts:44`: `: en ? "Your 7 days of Pro start now" : "I tuoi 7 giorni di Pro iniziano adesso",`
- `src/lib/trial.ts:48`: `? [’You signed up when LavorAI still had a limited free plan. From today, and until <strong>${ends}</strong>, your account has Pro access with up to <strong>5 applications per day during the trial</strong>. Complete your CV and preferences to start receiving matching jobs, tailored applications, and replies in your Inbox.’, "No card and no automatic renewal. When the trial ends, you can choose whether to continue with Pro."]`
- `src/lib/trial.ts:49`: `: [’Ti sei iscritto quando LavorAI aveva ancora un piano gratuito limitato. Da oggi, e fino a <strong>${ends}</strong>, il tuo account ha accesso Pro con fino a <strong>5 candidature al giorno nella prova</strong>. Completa CV e preferenze per iniziare a ricevere offerte compatibili, candidature su misura e risposte nella tua Inbox.’, "Nessuna carta e nessun rinnovo automatico. Alla fine della prova potrai scegliere se continuare con Pro."]`
- `src/lib/trial.ts:51`: `? [’Until <strong>${ends}</strong> your account has Pro access: LavorAI finds jobs matching your profile, adapts your CV and cover letter, and applies for you — up to <strong>5 applications per day during the trial</strong>. No card needed.’, "To get the most out of it, do these two things today:"]`
- `src/lib/trial.ts:52`: `: [’Fino a <strong>${ends}</strong> il tuo account ha accesso Pro: LavorAI trova le offerte compatibili con il tuo profilo, adatta CV e lettera, e si candida per te — fino a <strong>5 candidature al giorno nella prova</strong>. Nessuna carta richiesta.’, "Per sfruttarla al massimo, fai queste due cose oggi:"],`
- `src/lib/trial.ts:72`: `const { error } = await new Resend(apiKey).emails.send({ from: from(), to: u.email, subject: opts?.granted ? (en ? "Pro is on for you, 7 days" : "Pro attivo per te, 7 giorni") : en ? "Your 7 days of Pro start now" : "I tuoi 7 giorni di Pro iniziano adesso", html, text });`
- `src/lib/auth.ts:461`: `Hai 7 giorni di Pro gratis per provare, senza carta. Il piano Pro parte da €19.99/mese e lo puoi cancellare con un click.`
- `src/lib/billing.ts:50`: `tagline: "7 giorni di Pro dalla registrazione, fino a 5 candidature al giorno. Senza carta né rinnovo automatico.",`
- `src/lib/billing.ts:67`: `cta: "Prova Pro 7 giorni gratis",`
- `src/lib/billing.ts:244`: `// Prova Pro senza carta (dalla registrazione): Free → Pro fino a scadenza.`
- `src/lib/weekly-digest.ts:12`: `* offerte entrate nel pool negli ultimi 7 giorni che matchano i ruoli e`
- `src/lib/weekly-digest.ts:13`: `* manda le prime 5 con CTA alla prova Pro di 7 giorni. Chi non ha ruoli`
- `src/lib/weekly-digest.ts:176`: `: { label: en ? "Try Pro free for 7 days" : "Prova Pro gratis per 7 giorni", url: ’${site}/settings#billing’ },`
- `src/lib/auto-apply-self-heal.ts:329`: `’🔴 DELIVERY RATE LOW — only ${Math.round(r.detectedRate7d * 100)}% of successful applications in the last 7 days have hard DETECTED confirmation (${r.detectedSampleSize} success total). Investigate: an ATS may have changed its confirmation DOM, an adapter may be broken, or too many are falling through to email-recruiter path without proof.’,`

## Verification required before enabling rollout

1. Render IT and EN anonymous landing, pricing, signup/login, optimize, job-detail, guide, and terms pages with rollout disabled and enabled; inspect metadata/structured data as well as visible copy.
2. Inspect authenticated membership, trial banner, settings, upgrade dialogs and expired-trial screens for both cohorts.
3. Verify trial and welcome email selection for both password and OAuth/magic-link signup. New signup must not receive “7 days”, “no card”, “five applications/day”, or “no automatic renewal”.
4. Keep lifetime/legacy granted access and referral credits accurate. Do not promise free usage where a positive settled invoice is required.
5. Confirm explicit renewal amount, cancellation path, and no-application restriction appear before Stripe checkout and alongside the main CTA.
6. This inventory is historical; retained legacy strings are intentional. Production-rendered copy, legal review and actual Stripe reminder delivery remain release checks.
