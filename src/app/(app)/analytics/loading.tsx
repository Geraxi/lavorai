/**
 * Skeleton specifico di analytics: matcha il layout (KPI grid + chart
 * area + breakdown lists). Override del loading.tsx globale di (app).
 */
export default function AnalyticsLoading() {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1480, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 26 }}>
        <Bar w={200} h={26} />
        <div style={{ marginTop: 8 }}>
          <Bar w={360} h={14} muted />
        </div>
      </div>

      {/* KPI grid 4 cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: 20,
              borderRadius: 14,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <Bar w={120} h={11} muted />
            <Bar w={110} h={32} />
            <Bar w={140} h={11} muted />
          </div>
        ))}
      </div>

      {/* Main chart */}
      <div
        style={{
          padding: 22,
          borderRadius: 14,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          marginBottom: 22,
        }}
      >
        <Bar w={220} h={14} />
        <div
          style={{
            marginTop: 18,
            height: 240,
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          {Array.from({ length: 30 }).map((_, i) => (
            <Bar
              key={i}
              w="100%"
              h={Math.max(20, 40 + Math.sin(i * 0.35) * 80 + Math.cos(i * 0.6) * 40)}
              rounded={3}
            />
          ))}
        </div>
      </div>

      {/* 2-col breakdowns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}
        className="analytics-breakdown"
      >
        {[0, 1].map((col) => (
          <div
            key={col}
            style={{
              padding: 20,
              borderRadius: 14,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <Bar w={180} h={14} />
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Bar w={28} h={28} rounded={6} />
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <Bar w={`${60 - i * 8}%`} h={11} />
                  <Bar w={`${40 - i * 5}%`} h={9} muted />
                </div>
                <Bar w={50} h={12} muted />
              </div>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .analytics-breakdown {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
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
