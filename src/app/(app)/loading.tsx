/**
 * Skeleton globale per tutte le pagine sotto /(app)/.
 *
 * Next.js mostra questo IMMEDIATAMENTE al click su un Link mentre
 * il server component della pagina destination risolve in background.
 * Senza questo file, l'utente vede la pagina precedente "freezata"
 * finché la nuova non è pronta — sensazione di lentezza enorme.
 *
 * Lo skeleton è generico (topbar + content blocks) così funziona
 * per qualunque sub-route. Pagine specifiche possono override con
 * il loro loading.tsx.
 */
export default function AppLoading() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1480, margin: "0 auto" }}>
      {/* Topbar skeleton */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 28,
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Bar w={220} h={28} />
          <Bar w={320} h={14} muted />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Bar w={120} h={36} />
          <Bar w={140} h={36} />
        </div>
      </div>

      {/* Stat row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: 18,
              borderRadius: 12,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <Bar w={100} h={12} muted />
            <Bar w={80} h={26} />
            <Bar w={120} h={11} muted />
          </div>
        ))}
      </div>

      {/* Content blocks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: 18,
              borderRadius: 12,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              display: "flex",
              gap: 14,
              alignItems: "center",
            }}
          >
            <Bar w={44} h={44} rounded={8} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <Bar w="60%" h={14} />
              <Bar w="40%" h={12} muted />
            </div>
            <Bar w={70} h={24} rounded={999} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({
  w,
  h,
  muted,
  rounded,
}: {
  w: number | string;
  h: number;
  muted?: boolean;
  rounded?: number;
}) {
  return (
    <div
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: h,
        borderRadius: rounded ?? 6,
        background:
          "linear-gradient(90deg, var(--bg-sunken) 0%, var(--bg-elev) 50%, var(--bg-sunken) 100%)",
        backgroundSize: "200% 100%",
        animation: "ds-shimmer 1.4s linear infinite",
        opacity: muted ? 0.55 : 1,
      }}
    />
  );
}
