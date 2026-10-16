/**
 * Script inline che applica il tema PRIMA del primo paint (niente flash).
 * Preferenza salvata in localStorage "lavorai-theme": "light" | "dark".
 * Default: chiaro. Chi ha salvato esplicitamente "dark" lo mantiene; il
 * sistema si segue solo se l'utente ha scelto "system" esplicitamente.
 */
export function ThemeScript() {
  const code = `
(function() {
  try {
    var t = localStorage.getItem('lavorai-theme');
    if (t === 'system') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    if (t === 'dark') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`.trim();
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
