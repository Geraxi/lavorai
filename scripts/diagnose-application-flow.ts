#!/usr/bin/env node --import tsx
/**
 * DIAGNOSTIC: End-to-end application delivery flow audit
 * Maps: signup → CV → jobs → apply → delivery → replies
 * Identifies every broken link in the chain
 */

import { prisma } from "../src/lib/db";
import { resendSendingApiKey, resendReceivingApiKey } from "../src/lib/resend-keys";
import { recruiterEmailFallbackEnabled } from "../src/lib/recruiter-email-fallback";
import { applicationsPaused } from "../src/lib/application-pause";

function isAdzunaConfigured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

type Finding = {
  area: string;
  severity: "🔴 BROKEN" | "🟡 WARNING" | "🟢 OK" | "ℹ️  INFO";
  issue: string;
  fix?: string;
};

const findings: Finding[] = [];

function check(area: string, severity: Finding["severity"], issue: string, fix?: string) {
  findings.push({ area, severity, issue, fix });
}

async function main() {
  console.log("🔍 Diagnosing LavorAI Application Delivery Flow\n");

  // 1. JOB SOURCES
  console.log("📍 1. JOB SOURCES");
  const adzunaOk = isAdzunaConfigured();
  if (!adzunaOk) {
    check("Job Sources", "🔴 BROKEN", 
      "ADZUNA_APP_ID and ADZUNA_APP_KEY not configured",
      "Get free API keys from https://developer.adzuna.com and add to Vercel env"
    );
  } else {
    check("Job Sources", "🟢 OK", "Adzuna API configured");
  }

  // Check if jobs have real recruiter contacts
  const jobsWithRecruiterEmail = await prisma.job.count({
    where: { recruiterEmail: { not: null } }
  });
  const totalJobs = await prisma.job.count();
  const recruiterEmailPercent = totalJobs > 0 ? (jobsWithRecruiterEmail / totalJobs * 100).toFixed(1) : "0";
  
  check("Job Sources", "ℹ️  INFO", 
    `${totalJobs} jobs in DB, ${jobsWithRecruiterEmail} (${recruiterEmailPercent}%) have recruiter emails`
  );

  if (jobsWithRecruiterEmail === 0 && totalJobs > 0) {
    check("Job Sources", "🟡 WARNING",
      "No jobs have recruiter email addresses scraped",
      "Jobs from aggregators rarely contain direct recruiter contacts. May need to scrape job detail pages or use ATS APIs"
    );
  }

  // 2. EMAIL DELIVERY INFRASTRUCTURE
  console.log("\n📍 2. EMAIL DELIVERY INFRASTRUCTURE");
  
  const resendSending = resendSendingApiKey();
  if (!resendSending) {
    check("Email Delivery", "🔴 BROKEN",
      "RESEND_API_KEY not configured",
      "Add Resend API key to Vercel environment variables"
    );
  } else if (resendSending.includes("test") || resendSending.length < 20) {
    check("Email Delivery", "🟡 WARNING",
      "RESEND_API_KEY looks like a test key"
    );
  } else {
    check("Email Delivery", "🟢 OK", "Resend API key configured");
  }

  const emailFrom = process.env.EMAIL_FROM || process.env.RESEND_FROM_OVERRIDE;
  if (!emailFrom) {
    check("Email Delivery", "🔴 BROKEN",
      "EMAIL_FROM not configured",
      "Set EMAIL_FROM=candidature@lavorai.it in Vercel"
    );
  } else if (emailFrom.includes("resend.dev") || emailFrom.includes("onboarding@")) {
    check("Email Delivery", "🔴 BROKEN",
      `EMAIL_FROM is sandbox address: ${emailFrom}`,
      "Resend sandbox can only send to account owner. Verify lavorai.it domain in Resend and set EMAIL_FROM=candidature@lavorai.it"
    );
  } else {
    check("Email Delivery", "🟢 OK", `Email from address: ${emailFrom}`);
  }

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    check("Email Delivery", "🟡 WARNING",
      "RESEND_WEBHOOK_SECRET not configured",
      "Add webhook endpoint https://lavorai.it/api/webhooks/resend in Resend dashboard and copy secret"
    );
  } else {
    check("Email Delivery", "🟢 OK", "Resend webhook secret configured");
  }

  // 3. INBOUND REPLY HANDLING
  console.log("\n📍 3. INBOUND REPLY HANDLING");
  
  const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN;
  if (!inboundDomain) {
    check("Inbound Replies", "🟡 WARNING",
      "INBOUND_EMAIL_DOMAIN not configured",
      "Set INBOUND_EMAIL_DOMAIN=inbound.lavorai.it for reply routing (reply+<appId>@inbound.lavorai.it)"
    );
  } else {
    check("Inbound Replies", "🟢 OK", `Inbound domain: ${inboundDomain}`);
  }

  const resendReceiving = resendReceivingApiKey();
  if (!resendReceiving) {
    check("Inbound Replies", "🟡 WARNING",
      "No receiving API key configured (will use sending key)",
      "Optional: set RESEND_RECEIVING_API_KEY for dedicated inbound processing"
    );
  } else {
    check("Inbound Replies", "🟢 OK", "Resend receiving key configured");
  }

  // Check MX records setup (informational)
  check("Inbound Replies", "ℹ️  INFO",
    "Resend inbound requires MX records pointing to Resend's servers",
    "Configure in DNS: See Resend dashboard → Domains → Inbound"
  );

  // 4. APPLICATION DELIVERY SETTINGS
  console.log("\n📍 4. APPLICATION DELIVERY SETTINGS");
  
  const paused = applicationsPaused();
  if (paused) {
    check("Application Delivery", "🔴 BROKEN",
      "Applications are PAUSED via APPLICATIONS_PAUSED env var",
      "Remove APPLICATIONS_PAUSED from Vercel to enable delivery"
    );
  } else {
    check("Application Delivery", "🟢 OK", "Applications not paused");
  }

  const recruiterEmailEnabled = recruiterEmailFallbackEnabled();
  if (!recruiterEmailEnabled) {
    check("Application Delivery", "🟡 WARNING",
      "Recruiter email fallback is disabled",
      "Set RECRUITER_EMAIL_FALLBACK_ENABLED=true to enable direct email delivery"
    );
  } else {
    check("Application Delivery", "🟢 OK", "Recruiter email fallback enabled");
  }

  const userNotificationsHold = process.env.USER_NOTIFICATIONS_HOLD;
  if (userNotificationsHold === "true") {
    check("Application Delivery", "🟡 WARNING",
      "User notifications are held (USER_NOTIFICATIONS_HOLD=true)",
      "User won't receive email confirmations about their applications"
    );
  }

  // 5. DATABASE: ACTUAL APPLICATION STATUS
  console.log("\n📍 5. DATABASE: APPLICATION STATUS");
  
  const totalApps = await prisma.application.count();
  const statusBreakdown = await prisma.application.groupBy({
    by: ["status"],
    _count: true,
  });

  check("Applications", "ℹ️  INFO", `Total applications: ${totalApps}`);
  
  for (const stat of statusBreakdown) {
    const count = stat._count;
    const status = stat.status;
    check("Applications", "ℹ️  INFO", `  ${status}: ${count}`);
  }

  const successfulApps = await prisma.application.count({
    where: { status: "success" }
  });

  if (successfulApps === 0 && totalApps > 0) {
    check("Applications", "🟡 WARNING",
      "No successful applications yet",
      "Applications may be stuck in queue or failing at submission"
    );
  }

  // Check actual deliveries
  const emailAttempts = await prisma.applicationEmailAttempt.count();
  const acceptedEmails = await prisma.applicationEmailAttempt.count({
    where: { status: "accepted" }
  });
  const deliveredEmails = await prisma.applicationEmailAttempt.count({
    where: { status: "delivered" }
  });

  check("Email Deliveries", "ℹ️  INFO", 
    `${emailAttempts} email attempts, ${acceptedEmails} accepted, ${deliveredEmails} delivered`
  );

  if (emailAttempts === 0 && totalApps > 0) {
    check("Email Deliveries", "🔴 BROKEN",
      "No email delivery attempts recorded",
      "Applications are not reaching the email delivery stage. Check worker logs and application-worker.ts"
    );
  } else if (acceptedEmails === 0 && emailAttempts > 0) {
    check("Email Deliveries", "🔴 BROKEN",
      "Email attempts made but NONE accepted by Resend",
      "Check EMAIL_FROM sandbox issue or Resend API credentials"
    );
  }

  // Check for replies
  const repliesReceived = await prisma.applicationReply.count();
  const inboundEmails = await prisma.inboundEmail.count();

  check("Recruiter Replies", "ℹ️  INFO",
    `${repliesReceived} application replies, ${inboundEmails} inbound emails received`
  );

  if (deliveredEmails > 0 && repliesReceived === 0) {
    check("Recruiter Replies", "ℹ️  INFO",
      "Emails delivered but no replies yet",
      "Normal if applications are recent. Check reply-to address routing"
    );
  }

  // 6. CHECK ACTUAL USER JOURNEY
  console.log("\n📍 6. USER JOURNEY CHECK");
  
  const users = await prisma.user.count();
  const verifiedUsers = await prisma.user.count({
    where: { emailVerified: { not: null } }
  });
  const onboardedUsers = await prisma.user.count({
    where: { onboardedAt: { not: null } }
  });
  const usersWithCV = await prisma.cVDocument.count({
    distinct: ["userId"]
  });

  check("User Journey", "ℹ️  INFO", `${users} users, ${verifiedUsers} verified, ${onboardedUsers} onboarded`);
  check("User Journey", "ℹ️  INFO", `${usersWithCV} users have uploaded CV`);

  if (verifiedUsers === 0 && users > 0) {
    check("User Journey", "🟡 WARNING",
      "No verified users",
      "Email verification may be broken. Check Resend email delivery"
    );
  }

  // 7. FINAL DIAGNOSIS
  console.log("\n" + "=".repeat(80));
  console.log("📊 DIAGNOSIS SUMMARY\n");

  const broken = findings.filter(f => f.severity === "🔴 BROKEN");
  const warnings = findings.filter(f => f.severity === "🟡 WARNING");
  const ok = findings.filter(f => f.severity === "🟢 OK");

  console.log(`🔴 BROKEN: ${broken.length}`);
  console.log(`🟡 WARNING: ${warnings.length}`);
  console.log(`🟢 OK: ${ok.length}\n`);

  if (broken.length > 0) {
    console.log("❌ CRITICAL ISSUES (must fix for delivery to work):\n");
    for (const f of broken) {
      console.log(`[${f.area}] ${f.issue}`);
      if (f.fix) console.log(`   → Fix: ${f.fix}`);
      console.log();
    }
  }

  if (warnings.length > 0) {
    console.log("⚠️  WARNINGS (may impact functionality):\n");
    for (const f of warnings) {
      console.log(`[${f.area}] ${f.issue}`);
      if (f.fix) console.log(`   → Fix: ${f.fix}`);
      console.log();
    }
  }

  console.log("=".repeat(80));
  
  // Generate action checklist
  console.log("\n📋 ACTION CHECKLIST FOR FOUNDER:\n");
  
  const actions: string[] = [];
  
  if (!adzunaOk) {
    actions.push("❏ Register for Adzuna API at https://developer.adzuna.com (free)");
    actions.push("❏ Add ADZUNA_APP_ID and ADZUNA_APP_KEY to Vercel env vars");
  }
  
  if (!resendSending) {
    actions.push("❏ Sign up for Resend at https://resend.com");
    actions.push("❏ Get API key and add RESEND_API_KEY to Vercel");
  }
  
  if (!emailFrom || emailFrom.includes("resend.dev")) {
    actions.push("❏ Verify lavorai.it domain in Resend dashboard");
    actions.push("❏ Add DNS records (SPF, DKIM, DMARC) from Resend to domain DNS");
    actions.push("❏ Set EMAIL_FROM=candidature@lavorai.it in Vercel");
  }
  
  if (!webhookSecret) {
    actions.push("❏ Add webhook in Resend: https://lavorai.it/api/webhooks/resend");
    actions.push("❏ Copy webhook secret to RESEND_WEBHOOK_SECRET in Vercel");
  }
  
  if (!inboundDomain) {
    actions.push("❏ Set INBOUND_EMAIL_DOMAIN=inbound.lavorai.it in Vercel");
    actions.push("❏ Configure inbound MX records in DNS (see Resend dashboard)");
  }
  
  if (paused) {
    actions.push("❏ Remove APPLICATIONS_PAUSED from Vercel environment variables");
  }
  
  if (!recruiterEmailEnabled) {
    actions.push("❏ Set RECRUITER_EMAIL_FALLBACK_ENABLED=true in Vercel");
  }

  if (actions.length === 0) {
    console.log("✅ All major configuration items are set!\n");
    console.log("Next steps:");
    console.log("1. Test the full flow with a real user");
    console.log("2. Check application worker logs for delivery");
    console.log("3. Monitor Resend dashboard for email stats\n");
  } else {
    for (const action of actions) {
      console.log(action);
    }
    console.log();
  }

  await prisma.$disconnect();
}

main().catch(console.error);
