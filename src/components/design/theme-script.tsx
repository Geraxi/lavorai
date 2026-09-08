/**
 * Script inline che applica il tema PRIMA del primo paint (niente flash).
 * Preferenza salvata in localStorage "lavorai-theme": "light" | "dark".
 * Default: scuro (brand). Senza preferenza salvata si segue il sistema
 * solo se l'utente ha scelto "system" esplicitamente.
 */
export function ThemeScript() {
  const code = `
(function() {
  try {
    var t = localStorage.getItem('lavorai-theme');
    if (t === 'system') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  } catch (e) {}
})();
`.trim();
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
