/**
 * Riconoscimento crawler dai principali motori di ricerca e social.
 *
 * Serve per l'i18n: lavorai.it è un sito italiano, ma la lingua veniva
 * scelta dal paese del visitatore. Googlebot esplora quasi sempre da IP
 * statunitensi → riceveva la versione inglese e indicizzava quella,
 * penalizzando il posizionamento sulle query italiane. Ai bot serviamo
 * sempre l'italiano (la lingua canonica del sito).
 */
const BOT_RE =
  /googlebot|google-inspectiontool|adsbot-google|mediapartners-google|bingbot|bingpreview|yandex(bot)?|duckduckbot|baiduspider|applebot|slurp|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|pinterestbot|petalbot|seznambot|ia_archiver|semrushbot|ahrefsbot|mj12bot|dotbot|gptbot|oai-searchbot|chatgpt-user|perplexitybot|claudebot|claude-web|anthropic-ai|ccbot|bytespider|amazonbot|lighthouse|pagespeed|chrome-lighthouse/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  return !!ua && BOT_RE.test(ua);
}
