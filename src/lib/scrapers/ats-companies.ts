/**
 * Curated list di aziende che usano Greenhouse / Lever / Workable con
 * focus su Italia / Europa. Da estendere nel tempo.
 *
 * Criterio: aziende tech/SaaS/fintech con job listing IT o EU + ATS noto.
 */

export interface AtsCompany {
  slug: string; // slug usato dall'ATS (boards.greenhouse.io/<slug>)
  name: string; // nome user-facing
  country?: string;
}

export const GREENHOUSE_COMPANIES: AtsCompany[] = [
  // Italia
  { slug: "satispay", name: "Satispay", country: "IT" },
  { slug: "bendingspoons", name: "Bending Spoons", country: "IT" },
  { slug: "scalapay", name: "Scalapay", country: "IT" },
  { slug: "casavo", name: "Casavo", country: "IT" },
  { slug: "moneyfarm", name: "MoneyFarm", country: "IT" },
  { slug: "docebo", name: "Docebo", country: "IT" },
  { slug: "everli", name: "Everli", country: "IT" },
  { slug: "lastminutecom", name: "Lastminute.com", country: "IT" },
  { slug: "treatwell", name: "Treatwell", country: "IT" },
  { slug: "italist", name: "Italist", country: "IT" },
  { slug: "young", name: "Young Platform", country: "IT" },
  { slug: "growens", name: "Growens", country: "IT" },
  { slug: "jethr", name: "Jet HR", country: "IT" },
  { slug: "cleafy", name: "Cleafy", country: "IT" },
  { slug: "prima", name: "Prima Assicurazioni", country: "IT" },
  { slug: "wonderflow", name: "Wonderflow", country: "IT" },
  { slug: "moltiply", name: "Moltiply", country: "IT" },
  { slug: "faire", name: "Faire", country: "IT" },
  { slug: "brunello", name: "Brunello Cucinelli", country: "IT" },
  { slug: "nexiitaly", name: "Nexi Italy", country: "IT" },

  // EU ampio (hanno spesso roles remote EU / Italia)
  { slug: "airbnb", name: "Airbnb" },
  { slug: "stripe", name: "Stripe" },
  { slug: "spotify", name: "Spotify" },
  { slug: "getyourguide", name: "GetYourGuide" },
  { slug: "n26", name: "N26" },
  { slug: "revolut", name: "Revolut" },
  { slug: "remote", name: "Remote" },
  { slug: "deel", name: "Deel" },
  { slug: "miro", name: "Miro" },
  { slug: "hopin", name: "Hopin" },
  { slug: "notion", name: "Notion" },
  { slug: "canva", name: "Canva" },
  { slug: "intercom", name: "Intercom" },
  { slug: "algolia", name: "Algolia" },
  { slug: "mercari", name: "Mercari" },
  { slug: "typeform", name: "Typeform" },
  { slug: "personio", name: "Personio" },
  { slug: "sumup", name: "SumUp" },
  { slug: "tandem", name: "Tandem" },
  { slug: "qonto", name: "Qonto" },
  { slug: "pennylane", name: "Pennylane" },
  { slug: "alan", name: "Alan" },
  { slug: "doctolib", name: "Doctolib" },
  { slug: "backmarket", name: "Back Market" },
  { slug: "blablacar", name: "BlaBlaCar" },
  { slug: "contentful", name: "Contentful" },
  { slug: "wayflyer", name: "Wayflyer" },
  { slug: "ovhcloud", name: "OVHcloud" },
];

export const LEVER_COMPANIES: AtsCompany[] = [
  { slug: "mollie", name: "Mollie", country: "NL" },
  { slug: "figma", name: "Figma" },
  { slug: "notion", name: "Notion" }, // fallback se notion passa anche qui
  { slug: "linear", name: "Linear" },
  { slug: "vercel", name: "Vercel" },
  { slug: "supabase", name: "Supabase" },
  { slug: "posthog", name: "PostHog" },
  { slug: "calcom", name: "Cal.com" },
  { slug: "resend", name: "Resend" },
  { slug: "ramp", name: "Ramp" },
  { slug: "anthropic", name: "Anthropic" },
  { slug: "openai", name: "OpenAI" },
  { slug: "plaid", name: "Plaid" },
  { slug: "bolt", name: "Bolt", country: "EE" },
  { slug: "pleo", name: "Pleo", country: "DK" },
  { slug: "trade-republic", name: "Trade Republic", country: "DE" },
  { slug: "homa-games", name: "Homa", country: "FR" },
  { slug: "aircall", name: "Aircall", country: "FR" },
  { slug: "frontify", name: "Frontify", country: "CH" },
  { slug: "onfido", name: "Onfido", country: "UK" },
  { slug: "stint", name: "Stint" },
  { slug: "amplitude", name: "Amplitude" },
  { slug: "loom", name: "Loom" },
  { slug: "attest", name: "Attest" },
  { slug: "checkout", name: "Checkout.com" },
  { slug: "getquin", name: "getquin" },
];
