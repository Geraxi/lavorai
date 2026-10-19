/**
 * Script inline che applica il tema PRIMA del primo paint (niente flash).
 * Preferenza salvata in localStorage "lavorai-theme": "light" | "dark".
 * Default: SCURO (premium design). Chi salva esplicitamente "light" lo mantiene;
 * il sistema si segue solo se l'utente ha scelto "system" esplicitamente.
 */
export function ThemeScript() {
  const code = `
(function() {
  try {
    var t = localStorage.getItem('lavorai-theme');
    if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  } catch (e) {
    document.documentElement.removeAttribute('data-theme');
  }
})();
`.trim();
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
