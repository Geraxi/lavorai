import { z } from "zod";

/**
 * Ground-truth CV profile. All per-job tailoring must REORDER / REWORD /
 * TRANSLATE — never add skills or experiences not present here.
 */

export const ExperienceSchema = z.object({
  role: z.string().max(120).default(""),
  company: z.string().max(120).default(""),
  location: z.string().max(120).default(""),
  startDate: z.string().max(20).default(""), // "2023-03" free format, no strict parse
  endDate: z.string().max(20).default(""),   // "" or "Present" or "2024-09"
  description: z.string().max(2000).default(""),
  bullets: z.array(z.string().max(300)).max(12).default([]),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const EducationSchema = z.object({
  degree: z.string().max(160).default(""),
  school: z.string().max(160).default(""),
  location: z.string().max(120).default(""),
  startDate: z.string().max(20).default(""),
  endDate: z.string().max(20).default(""),
  notes: z.string().max(500).default(""),
});
export type Education = z.infer<typeof EducationSchema>;

export const SkillSchema = z.object({
  name: z.string().min(1).max(60),
  // No level — ATS templates keep skills flat.
});
export type Skill = z.infer<typeof SkillSchema>;

export const LanguageSchema = z.object({
  name: z.string().max(40).default(""),
  level: z.string().max(20).default(""), // "Madrelingua" | "C1" | etc. free text
});
export type Language = z.infer<typeof LanguageSchema>;

export const LinkSchema = z.object({
  label: z.string().max(40).default(""),
  url: z.string().max(300).default(""),
});
export type Link = z.infer<typeof LinkSchema>;

export const CVProfileSchema = z.object({
  firstName: z.string().max(80).default(""),
  lastName: z.string().max(80).default(""),
  email: z.string().max(160).default(""),
  phone: z.string().max(40).default(""),
  city: z.string().max(120).default(""),
  title: z.string().max(120).default(""),
  summary: z.string().max(1200).default(""),
  experiences: z.array(ExperienceSchema).max(30).default([]),
  education: z.array(EducationSchema).max(20).default([]),
  skills: z.array(SkillSchema).max(60).default([]),
  languages: z.array(LanguageSchema).max(10).default([]),
  links: z.array(LinkSchema).max(10).default([]),
});
export type CVProfile = z.infer<typeof CVProfileSchema>;

export const EMPTY_PROFILE: CVProfile = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  city: "",
  title: "",
  summary: "",
  experiences: [],
  education: [],
  skills: [],
  languages: [],
  links: [],
};

/** Parse a row from Prisma CVProfile (JSON string fields) into validated shape. */
export function rowToProfile(row: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  title: string;
  summary: string;
  experiencesJson: string;
  educationJson: string;
  skillsJson: string;
  languagesJson: string;
  linksJson: string;
}): CVProfile {
  const parseArr = <T>(s: string, schema: z.ZodType<T>): T[] => {
    try {
      const v = JSON.parse(s);
      if (!Array.isArray(v)) return [];
      return v
        .map((it) => {
          const r = schema.safeParse(it);
          return r.success ? r.data : null;
        })
        .filter((x): x is T => x !== null);
    } catch {
      return [];
    }
  };
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    city: row.city,
    title: row.title,
    summary: row.summary,
    experiences: parseArr(row.experiencesJson, ExperienceSchema),
    education: parseArr(row.educationJson, EducationSchema),
    skills: parseArr(row.skillsJson, SkillSchema),
    languages: parseArr(row.languagesJson, LanguageSchema),
    links: parseArr(row.linksJson, LinkSchema),
  };
}

export function profileToRow(p: CVProfile): {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  title: string;
  summary: string;
  experiencesJson: string;
  educationJson: string;
  skillsJson: string;
  languagesJson: string;
  linksJson: string;
} {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
    city: p.city,
    title: p.title,
    summary: p.summary,
    experiencesJson: JSON.stringify(p.experiences),
    educationJson: JSON.stringify(p.education),
    skillsJson: JSON.stringify(p.skills),
    languagesJson: JSON.stringify(p.languages),
    linksJson: JSON.stringify(p.links),
  };
}
