import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { AdminTopbar } from "@/components/admin-topbar";

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
  if (!isAdmin(user?.email)) notFound();

  return (
    <div className="adm-root">
      <AdminTopbar userName={user?.name ?? user?.email?.split("@")[0] ?? "Admin"} />
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
          overflow: hidden;
          padding: 14px 22px 18px;
          display: flex;
          flex-direction: column;
        }
        .adm-content > * { min-height: 0; }

        /* ── Primitive condivise ─────────────────────────────────── */
        .adm-page {
          display: grid;
          gap: 12px;
          height: 100%;
          min-height: 0;
        }
        .adm-card {
          background: var(--bg-elev);
          border: 1px solid var(--border-ds);
          border-radius: 14px;
          padding: 16px 18px;
          min-height: 0;
          min-width: 0;
          overflow: hidden;
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
        .adm-card-body.scroll { overflow-y: auto; }
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
        .adm-fill { flex: 1; min-height: 0; }
        .adm-svg-fill { width: 100%; height: 100%; display: block; }

        /* Schermi bassi (laptop 13"): compatta padding e cifre per restare fit. */
        @media (max-height: 900px) {
          .adm-content { padding: 10px 18px 12px; }
          .adm-card { padding: 12px 14px; }
          .adm-card-head { margin-bottom: 6px; }
          .adm-page { gap: 10px; }
          .adm-page h1 { font-size: 22px !important; }
        }
        @media (max-width: 1100px) {
          .adm-content { overflow: auto; }
          .adm-page { height: auto; grid-template-columns: 1fr !important; grid-template-rows: none !important; }
          .adm-card { min-height: 220px; }
        }
      `}</style>
    </div>
  );
}
