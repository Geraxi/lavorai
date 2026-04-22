import { ImageResponse } from "next/og";

// Next.js tab icon (favicon) — rendered on the edge at build/request time.
// Overrides /src/app/favicon.ico.

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16a34a",
          color: "#ffffff",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif",
          borderRadius: 6,
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
