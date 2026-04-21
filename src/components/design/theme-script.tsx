/**
 * Script inline che setta data-theme PRIMA del render per evitare FOUC
 * quando si torna sulla pagina con tema dark salvato.
 */
export function ThemeScript() {
  const code = `
(function() {
  try {
    var t = localStorage.getItem('lavorai-theme') || 'light';
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  } catch (e) {}
})();
`.trim();
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
