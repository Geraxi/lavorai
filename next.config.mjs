import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  // Pacchetti Node-only fuori bundle (worker + chromium binary a lato)
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "playwright",
    "playwright-core",
    "@sparticuz/chromium",
    "mammoth",
  ],
  // ESCLUDI Chromium/Playwright da tutte le API routes — il browser gira SOLO
  // sul Railway worker, NON su Vercel serverless. Prima questa config spediva
  // 51 MB di Chromium in OGNI function (323 files × 51 MB = 205 GB storage).
  outputFileTracingExcludes: {
    "/api/**": [
      "./node_modules/@sparticuz/chromium/**",
      "./node_modules/playwright/**",
      "./node_modules/playwright-core/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      // Alias storico: /onboarding/cv → /onboarding step 1
      { source: "/onboarding/cv", destination: "/onboarding", permanent: true },
      { source: "/trasparenza", destination: "/proof", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
