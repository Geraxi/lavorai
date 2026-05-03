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
          <rect x="4" y="3" width="6" height="9" rx="0.5" fill="#FAFAF7" />
          <rect x="4" y="13" width="6" height="4" rx="0.5" fill="#C49A5C" />
          <rect x="4" y="18" width="16" height="3.5" rx="0.5" fill="#FAFAF7" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
