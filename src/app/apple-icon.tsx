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
          background: "#0F1012",
          borderRadius: 36,
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="6" y="3" width="5" height="13" rx="0.6" fill="#FAFAF7" />
          <rect x="6" y="17" width="14" height="4" rx="0.6" fill="#FAFAF7" />
          <rect x="6" y="13" width="5" height="4" rx="0.6" fill="#C49A5C" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
