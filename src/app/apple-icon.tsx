import { ImageResponse } from "next/og";

// Apple touch icon (home screen on iOS).

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 120,
          fontWeight: 700,
          letterSpacing: "-0.05em",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif",
          borderRadius: 36,
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
