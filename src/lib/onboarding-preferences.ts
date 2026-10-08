import { z } from "zod";

export const OnboardingPreferencesSchema = z.object({
  roles: z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  locations: z.array(z.string().trim().min(1).max(80)).max(30),
  salaryMin: z.number().int().min(0).max(500),
  modeSel: z.object({
    remoto: z.boolean(),
    ibrido: z.boolean(),
    sede: z.boolean(),
  }).refine(value => value.remoto || value.ibrido || value.sede, { message: "Select at least one work arrangement" }),
  employmentType: z.enum(["employee", "piva", "both"]).optional(),
  dailyRate: z.number().int().min(0).max(5000).nullable().optional(),
  availableFrom: z.string().trim().max(60).nullable().optional(),
  portfolioUrl: z
    .string()
    .trim()
    .max(300)
    .url()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});
