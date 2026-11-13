import { NextResponse } from "next/server";
import { applicationsPaused } from "@/lib/application-pause";
import { recruiterEmailFallbackEnabled } from "@/lib/recruiter-email-fallback";
import { resendSendingApiKey } from "@/lib/resend-keys";

export const runtime = "nodejs";

/**
 * GET /api/health/delivery
 * 
 * Health check endpoint for application delivery infrastructure.
 * Returns configuration status for all critical delivery components.
 * 
 * Use this to diagnose why applications aren't reaching recruiters.
 */
export async function GET() {
  const resendKey = resendSendingApiKey();
  const emailFrom = process.env.EMAIL_FROM || process.env.RESEND_FROM_OVERRIDE;
  const isProductionSandbox = 
    process.env.NODE_ENV === "production" && 
    emailFrom?.toLowerCase().includes("resend.dev");

  const checks = {
    // Job sources
    adzuna_configured: Boolean(
      process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY
    ),
    
    // Email sending infrastructure
    resend_api_key: Boolean(resendKey),
    email_from_configured: Boolean(emailFrom),
    email_from_sandbox: emailFrom?.includes("resend.dev") || false,
    email_from_valid: Boolean(emailFrom && !emailFrom.includes("resend.dev")),
    resend_webhook_secret: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    
    // Inbound reply handling
    inbound_email_domain: process.env.INBOUND_EMAIL_DOMAIN || null,
    inbound_configured: Boolean(process.env.INBOUND_EMAIL_DOMAIN),
    resend_receiving_key: Boolean(process.env.RESEND_RECEIVING_API_KEY),
    
    // Application delivery gates
    applications_paused: applicationsPaused(),
    recruiter_email_enabled: recruiterEmailFallbackEnabled(),
    user_notifications_hold: process.env.USER_NOTIFICATIONS_HOLD === "true",
    
    // Environment
    node_env: process.env.NODE_ENV || "development",
  };

  const blockers: string[] = [];
  const warnings: string[] = [];

  // Critical blockers
  if (!checks.adzuna_configured) {
    blockers.push("Adzuna API not configured - users will only see mock/stale jobs without recruiter contacts");
  }
  
  if (!checks.resend_api_key) {
    blockers.push("RESEND_API_KEY not configured - cannot send any emails");
  }
  
  if (!checks.email_from_configured) {
    blockers.push("EMAIL_FROM not configured - cannot send emails");
  }
  
  if (isProductionSandbox) {
    blockers.push("CRITICAL: EMAIL_FROM is Resend sandbox in production - ALL recruiter emails are BLOCKED. Verify lavorai.it domain in Resend and set EMAIL_FROM=candidature@lavorai.it");
  }
  
  if (checks.applications_paused) {
    blockers.push("Applications are PAUSED - no applications will be sent. Remove APPLICATIONS_PAUSED env var.");
  }

  // Warnings
  if (!checks.resend_webhook_secret) {
    warnings.push("RESEND_WEBHOOK_SECRET not configured - no delivery tracking or bounce handling");
  }
  
  if (!checks.inbound_configured) {
    warnings.push("INBOUND_EMAIL_DOMAIN not configured - recruiter replies won't be routed to user inboxes");
  }
  
  if (!checks.recruiter_email_enabled) {
    warnings.push("Recruiter email fallback disabled - applications will only use portal automation");
  }
  
  if (checks.user_notifications_hold) {
    warnings.push("User notifications are held - users won't receive application confirmations");
  }
  
  if (checks.email_from_sandbox && process.env.NODE_ENV !== "production") {
    warnings.push("EMAIL_FROM is sandbox - acceptable for development but must be changed for production");
  }

  const healthy = blockers.length === 0;
  const status = healthy ? "healthy" : "degraded";

  return NextResponse.json({
    status,
    healthy,
    blockers,
    warnings,
    checks,
    help: {
      adzuna: "Get free API keys from https://developer.adzuna.com",
      resend: "Get API key from https://resend.com/api-keys",
      email_verification: "Verify lavorai.it domain in Resend dashboard, add DNS records (SPF, DKIM, DMARC)",
      webhook: "Add webhook https://lavorai.it/api/webhooks/resend in Resend dashboard",
      inbound_mx: "Configure MX records for inbound.lavorai.it to point to Resend servers",
    },
    docs: {
      setup_guide: "https://github.com/Geraxi/lavorai#environment-variables",
      delivery_audit: "/DELIVERY_AUDIT.md in repository",
    },
  }, {
    status: healthy ? 200 : 503,
  });
}
