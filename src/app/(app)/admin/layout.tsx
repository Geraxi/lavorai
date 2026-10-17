import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { AdminAutoRefresh } from "@/components/admin-auto-refresh";
import { AdminTopbar } from "@/components/admin-topbar";
import { AdminMobileNav } from "@/components/admin-mobile-nav";
import { getAdminAlerts } from "@/lib/admin-alerts";

/**
 * Layout /admin — fit-to-viewport.
 *
 * L'AppShell esterno è già `height:100vh` con la sidebar unica (sezione
 * ADMIN inclusa). Qui aggiungiamo solo la topbar e un'area contenuto che
 * riempie lo spazio rimanente SENZA scroll di pagina: ogni pagina admin è
 * una griglia `height:100%` e lo scroll, se serve, vive dentro le card.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const alerts = isAdmin(user?.email) ? await getAdminAlerts() : [];
  if (!isAdmin(user?.email)) notFound();

  return (
    <div className="adm-root">
      <AdminAutoRefresh />
      <AdminTopbar userName={user?.name ?? "Umberto"} email={user?.email ?? ""} alerts={alerts} />
      <AdminMobileNav />
      <div className="adm-content">{children}</div>

      <style>{`
        .adm-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          flex: 1;
        }
        .adm-content {
          flex: 1;
          min-height: 0;
          overflow: auto;                 /* la pagina admin scorre se il contenuto non ci sta */
          padding: 14px 22px 22px;
          display: flex;
          flex-direction: column;
        }
        /* La pagina NON deve mai comprimersi all'altezza del contenitore:
           con min-height:0 sulle card le righe auto scendevano sotto il
           contenuto e le card si sovrapponevano. */
        .adm-content > * { flex: none; min-height: auto; }
        .adm-page [style*="min-height"] { min-height: auto !important; }

        /* Nav sezioni: solo <1024px (su desktop c'è la sidebar). */
        .adm-mobile-nav { display: none; }
        @media (max-width: 1023px) {
          .adm-mobile-nav {
            display: flex; gap: 6px; padding: 6px 12px;
            border-bottom: 1px solid var(--border-ds); flex-shrink: 0;
            scroll-padding-inline: 12px;
          }
          .adm-mobile-nav-item {
            display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px;
            border-radius: 10px; font-size: 13px; font-weight: 600; text-decoration: none;
            color: var(--fg-muted); border: 1px solid transparent;
          }
          .adm-mobile-nav-item[aria-current="page"] {
            color: hsl(var(--primary)); background: hsl(var(--primary) / 0.12);
            border-color: hsl(var(--primary) / 0.35);
          }
        }

        /* ── Primitive condivise ─────────────────────────────────── */
        .adm-page {
          display: grid;
          gap: 14px;
          height: auto;
          min-height: 0;
          align-content: start;
          /* Le righe prendono l'altezza del contenuto: niente card schiacciate
             per forzare tutto nel viewport. */
          grid-template-rows: none !important;
        }
        .adm-page [style*="grid-template-rows"] { grid-template-rows: none !important; }
        .adm-card {
          background: var(--bg-elev);
          border: 1px solid var(--border-ds);
          border-radius: 14px;
          padding: 16px 18px;
          min-height: auto;
          min-width: 0;
          overflow: visible;              /* niente contenuti tagliati */
          display: flex;
          flex-direction: column;
        }
        .adm-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
          flex-shrink: 0;
        }
        .adm-card-title { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; color: var(--fg); }
        .adm-card-sub { font-size: 11.5px; color: var(--fg-subtle); margin-top: 2px; }
        .adm-card-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
        .adm-card-body > * { min-width: 0; }   /* i figli di griglia non sforano la card */
        .adm-card-body.scroll { overflow-y: auto; max-height: 440px; }   /* liste lunghe: scroll interno */
        .adm-card-body.scroll::-webkit-scrollbar { width: 6px; }
        .adm-card-body.scroll::-webkit-scrollbar-thumb { background: var(--border-ds); border-radius: 3px; }
        .adm-link { font-size: 11.5px; color: hsl(var(--primary)); text-decoration: none; font-weight: 600; white-space: nowrap; }
        .adm-link:hover { text-decoration: underline; }
        .adm-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
          white-space: nowrap;
        }
        .adm-pill .dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; box-shadow: 0 0 6px currentColor; }
        .adm-pill.good { background: hsl(var(--primary)/0.14); color: hsl(var(--primary)); }
        .adm-pill.warn { background: rgba(251,191,36,0.14); color: #fbbf24; }
        .adm-pill.bad  { background: rgba(248,113,113,0.14); color: #f87171; }
        .adm-pill.info { background: rgba(96,165,250,0.14); color: #60a5fa; }
        .adm-pill.neutral { background: var(--bg-sunken); color: var(--fg-muted); border: 1px solid var(--border-ds); }
        .adm-kpi-link { transition: border-color .15s, transform .15s; }
        .adm-kpi-link:hover { border-color: hsl(var(--primary)/0.5) !important; transform: translateY(-1px); }
        .adm-th {
          display: grid; gap: 10px; align-items: center;
          font-size: 10.5px; color: var(--fg-subtle); text-transform: uppercase; letter-spacing: 0.06em;
          padding: 4px 0 8px; border-bottom: 1px solid var(--border-ds); flex-shrink: 0;
        }
        .adm-tr {
          display: grid; gap: 10px; align-items: center;
          padding: 8px 0; border-bottom: 1px solid var(--border-ds); font-size: 12.5px;
        }
        .adm-tr:last-child { border-bottom: 0; }
        .adm-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .adm-num { font-feature-settings: "tnum"; font-variant-numeric: tabular-nums; }
        .adm-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 12px; border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer;
          background: var(--bg-elev); border: 1px solid var(--border-ds); color: var(--fg);
          white-space: nowrap; text-decoration: none;
        }
        .adm-btn:hover { background: var(--bg-sunken); }
        .adm-btn.primary { background: hsl(var(--primary)); color: #04130c; border-color: transparent; }
        .adm-btn.primary:hover { filter: brightness(1.08); }
        .adm-btn.sm { padding: 4px 9px; font-size: 11px; border-radius: 7px; }
        .adm-quote { font-size: 12px; color: var(--fg-subtle); font-style: italic; white-space: nowrap; }
        .adm-fill { flex: 1; min-height: 230px; }
        .adm-th > * { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .adm-svg-fill { width: 100%; height: 100%; display: block; }
        /* Barra filtri (ricerca + pill): le pill sono uno scroller orizzontale. */
        .adm-filterbar { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(0, max-content); gap: 8px; margin-bottom: 12px; flex-shrink: 0; align-items: center; min-width: 0; }
        .adm-filter-pills { gap: 8px; }
        .adm-tabs { gap: 2px; }
        .adm-pager { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }

        /* Schermi bassi (laptop 13"): compatta padding e cifre per restare fit. */
        @media (max-height: 900px) {
          .adm-content { padding: 10px 18px 12px; }
          .adm-card { padding: 12px 14px; }
          .adm-card-head { margin-bottom: 6px; }
          .adm-page { gap: 10px; }
          .adm-page h1 { font-size: 22px !important; }
        }
        /* Mobile/tablet: un solo scroller (il <main> dell'AppShell), niente
           scroll annidato admin-dentro-main che su iOS blocca i gesti. */
        @media (max-width: 1023px) {
          .adm-root { height: auto; flex: none; }
          .adm-content { overflow: visible; flex: none; }
        }
        @media (max-width: 1100px) {
          /* minmax(0,1fr): una card larga non allarga più la colonna oltre lo schermo. */
          .adm-page { height: auto; grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: none !important; }
          .adm-page > * { min-width: 0; max-width: 100%; }
          .adm-card { min-height: 220px; }
        }
        /* ── Tablet: tabelle scorrono in orizzontale dentro la card, KPI a 2 colonne ── */
        @media (max-width: 900px) {
          .adm-content { padding: 10px 12px 16px; }
          .adm-page > div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
          .adm-page > div[style*="repeat(5"], .adm-page > div[style*="repeat(4"], .adm-page > div[style*="repeat(3"] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .adm-card { overflow-x: auto; -webkit-overflow-scrolling: touch; min-height: 0; }
          .adm-th, .adm-tr { min-width: 560px; }
          .adm-quote { display: none; }
          .adm-topbar { flex-wrap: wrap; gap: 8px; padding: 8px 10px; }
          .adm-topbar > * { min-width: 0; }
        }
        /* ── Telefono: ogni riga diventa una scheda a 2 colonne, header nascosto ── */
        @media (max-width: 640px) {
          .adm-page > div[style*="repeat(5"], .adm-page > div[style*="repeat(4"], .adm-page > div[style*="repeat(3"], .adm-page > div[style*="repeat(2"] { grid-template-columns: 1fr !important; }
          .adm-card { overflow-x: hidden; min-height: 0; }
          .adm-th { display: none; }
          .adm-tr { min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; row-gap: 4px; padding: 10px 0; }
          .adm-tr > * { min-width: 0; }
          .adm-page h1 { font-size: 20px !important; }
          /* Le righe non devono sporgere (margin negativo) oltre la card. */
          .adm-card-body > .adm-tr { margin-left: 0 !important; margin-right: 0 !important; }
          .adm-content select { max-width: 100%; }
          /* Filtri: ricerca a tutta larghezza, pill scorrevoli sotto. */
          .adm-filterbar { grid-template-columns: minmax(0, 1fr); }
          .adm-filterbar input { min-height: 44px; font-size: 16px !important; }
          /* Utenti: email a tutta riga, niente checkbox/menu finti. */
          .adm-users-row > :nth-child(1), .adm-users-row > :nth-child(10) { display: none !important; }
          .adm-users-row > :nth-child(2) { grid-column: 1 / -1; }
          /* Paginazione: bersagli da 44px. */
          .adm-pager .adm-btn { min-width: 44px; min-height: 44px; justify-content: center; }
          .adm-tabs > a { min-height: 44px; display: inline-flex; align-items: center; }
          /* Topbar compatta su una riga: ricerca, periodo, campanella, avatar. */
          .adm-topbar { flex-wrap: nowrap; padding: 8px 12px; }
          .adm-topbar-search { flex: 1 1 auto !important; min-width: 0; min-height: 44px; }
          .adm-topbar-search > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
          .adm-topbar-kbd, .adm-topbar-live, .adm-topbar-who, .adm-topbar-spacer { display: none !important; }
          .adm-topbar-user { padding-left: 0 !important; flex-shrink: 0; }
          .adm-topbar select { flex-shrink: 0; min-height: 44px; }
          /* Con il selettore periodo la ricerca diventa solo icona. */
          .adm-topbar:has(select) .adm-topbar-search { flex: 0 0 44px !important; justify-content: center; padding: 0 !important; }
          .adm-topbar:has(select) .adm-topbar-search > span { display: none; }
          .adm-topbar:has(select) select { flex: 1 1 auto; min-width: 0; }
          /* Titolo pagina: azioni sotto al titolo, a capo se serve. */
          .adm-pagetitle { flex-wrap: wrap; gap: 10px !important; }
          .adm-pagetitle > :first-child { flex: 1 1 100%; }
          /* Traffico: mappa impilata (titolo, tab, lista paesi, globo). */
          .adm-globe-card { height: auto !important; }
          .adm-tmap { grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: auto auto minmax(320px, auto); height: auto !important; }
          .adm-tmap-head { position: static !important; flex-direction: column; gap: 10px; padding: 14px 14px 4px; }
          .adm-tmap-tabs button { min-height: 40px; }
          .adm-tmap-list { padding: 4px 14px 10px !important; max-height: 240px; }
          .adm-tmap-main { min-height: 320px; }
          .adm-tmap-main > div[style*="64px 18px"] { padding-top: 8px !important; }
          .adm-pagetitle-actions { flex-wrap: wrap; flex-shrink: 1 !important; padding-top: 0 !important; max-width: 100%; }
          .adm-topbar button[aria-label^="Notifiche"] { width: 44px !important; height: 44px !important; }
          .adm-topbar div[role="dialog"][aria-label="Notifiche"] { position: fixed !important; top: 64px !important; left: 12px !important; right: 12px !important; width: auto !important; }
        }
      `}</style>
    </div>
  );
}
