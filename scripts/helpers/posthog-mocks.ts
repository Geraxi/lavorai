import * as shared from "../../src/lib/posthog/shared";

/** Keep existing route/component VM tests hermetic; SDK behavior has its own suite. */
export const posthogMocks: Record<string, unknown> = {
  "@/lib/posthog/server": {
    captureApiException: async () => {},
    captureServerEvent: async () => {},
    rememberAnalyticsConsent: async () => {},
  },
  "@/lib/posthog/client": { captureFunnel: () => {}, syncPostHogConsent: () => false, resetAnalyticsUser: () => {} },
  "@/lib/posthog/shared": shared,
  "@/components/analytics-upgrade-wall": { AnalyticsUpgradeWall: () => null },
};
