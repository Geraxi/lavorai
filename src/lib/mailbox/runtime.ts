/** Dipendenze reali (prisma, storage, crypto, verifica destinatario). */
import { prisma } from "@/lib/db";
import { readUserFile } from "@/lib/storage";
import { encryptString, decryptString } from "@/lib/crypto";
import { findVerifiedRecruiterEmail } from "@/lib/recruiter-email";
import { makeClientFor, type MailboxDeps } from "./service";

export function realMailboxDeps(): MailboxDeps {
  const base = { db: prisma, now: () => new Date(), decrypt: decryptString, encrypt: encryptString };
  return {
    ...base,
    env: process.env,
    readFile: readUserFile,
    findRecipient: async (job) => {
      const r = await findVerifiedRecruiterEmail(job.url, job.company, job.recruiterEmail, {
        description: job.description,
      });
      return r ? { email: r.email, provenance: r } : null;
    },
    clientFor: makeClientFor(base),
  };
}
