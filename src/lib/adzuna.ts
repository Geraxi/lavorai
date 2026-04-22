/**
 * Client per Adzuna Jobs API.
 * Docs: https://developer.adzuna.com/docs/search
 *
 * Setup:
 * 1. Registrarsi gratis su https://developer.adzuna.com
 * 2. Ottenere ADZUNA_APP_ID + ADZUNA_APP_KEY
 * 3. Aggiungere a .env.local
 *
 * Senza le chiavi, il client ritorna un mock di 20 job italiani per
 * sviluppo locale — permette di sviluppare tutta la UI senza dipendenze.
 */

import type { Job } from "@prisma/client";

const BASE_URL = "https://api.adzuna.com/v1/api/jobs/it/search";

export interface AdzunaSearchParams {
  what?: string;
  where?: string;
  page?: number;
  resultsPerPage?: number;
  fullTime?: boolean;
  permanent?: boolean;
  partTime?: boolean;
  contract?: boolean;
  salaryMin?: number;
}

export interface AdzunaJob {
  id: string;
  title: string;
  description: string;
  company: { display_name?: string };
  location: { display_name?: string; area?: string[] };
  category?: { label?: string };
  contract_type?: string;
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
  created: string;
}

export type JobListItem = Omit<Job, "cachedAt">;

interface AdzunaSearchResponse {
  count: number;
  results: AdzunaJob[];
}

function hasCredentials(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

export async function searchJobs(
  params: AdzunaSearchParams = {},
): Promise<JobListItem[]> {
  if (!hasCredentials()) {
    return mockJobs(params);
  }

  const page = params.page ?? 1;
  const perPage = params.resultsPerPage ?? 20;

  const url = new URL(`${BASE_URL}/${page}`);
  url.searchParams.set("app_id", process.env.ADZUNA_APP_ID!);
  url.searchParams.set("app_key", process.env.ADZUNA_APP_KEY!);
  url.searchParams.set("results_per_page", String(perPage));
  url.searchParams.set("content-type", "application/json");

  if (params.what) url.searchParams.set("what", params.what);
  if (params.where) url.searchParams.set("where", params.where);
  if (params.fullTime) url.searchParams.set("full_time", "1");
  if (params.partTime) url.searchParams.set("part_time", "1");
  if (params.permanent) url.searchParams.set("permanent", "1");
  if (params.contract) url.searchParams.set("contract", "1");
  if (params.salaryMin) url.searchParams.set("salary_min", String(params.salaryMin));

  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) {
    throw new Error(`Adzuna API ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = (await res.json()) as AdzunaSearchResponse;
  return data.results.map(toJobListItem);
}

function toJobListItem(a: AdzunaJob): JobListItem {
  return {
    id: "", // filled al write in DB
    externalId: a.id,
    source: "adzuna",
    title: a.title,
    company: a.company?.display_name ?? null,
    location: a.location?.display_name ?? null,
    description: a.description,
    url: a.redirect_url,
    contractType: a.contract_type ?? null,
    remote: /remote|smart\s*working|in\s*remoto/i.test(
      `${a.title} ${a.description}`.slice(0, 600),
    ),
    salaryMin: a.salary_min ? Math.round(a.salary_min) : null,
    salaryMax: a.salary_max ? Math.round(a.salary_max) : null,
    category: a.category?.label ?? null,
    postedAt: a.created ? new Date(a.created) : null,
    recruiterEmail: null,
    recruiterScrapedAt: null,
  };
}

// ---- MOCK per dev senza chiavi Adzuna ----

function mockJobs(params: AdzunaSearchParams): JobListItem[] {
  const seed: Omit<JobListItem, "externalId">[] = [
    {
      id: "",
      source: "mock",
      title: "Junior Full-Stack Developer",
      company: "Satispay",
      location: "Milano, Italia",
      description:
        "Stiamo cercando un Junior Full-Stack Developer per unirsi al nostro team. Stack: TypeScript, React, Node.js, PostgreSQL. Esperienza con Next.js e test automatici gradita. Ambiente agile, mentoring dedicato, stock options.",
      url: "https://example.com/jobs/satispay-fullstack",
      contractType: "permanent",
      remote: false,
      salaryMin: 28000,
      salaryMax: 38000,
      category: "IT Jobs",
      postedAt: new Date(Date.now() - 2 * 86400_000),
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
    {
      id: "",
      source: "mock",
      title: "AI Engineer — GenAI / LLM",
      company: "Bending Spoons",
      location: "Milano, Italia",
      description:
        "Cerchiamo un AI Engineer con esperienza su LLM e applicazioni GenAI. Python, LangChain, RAG, deployment cloud (AWS/GCP). Almeno 2 anni di esperienza. Remoto ibrido 2 giorni in ufficio.",
      url: "https://example.com/jobs/bendingspoons-ai",
      contractType: "permanent",
      remote: false,
      salaryMin: 45000,
      salaryMax: 70000,
      category: "IT Jobs",
      postedAt: new Date(Date.now() - 1 * 86400_000),
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
    {
      id: "",
      source: "mock",
      title: "Frontend Developer React — 100% Remote",
      company: "Nozomi Networks",
      location: "Remoto · Italia",
      description:
        "Frontend Developer React/Next.js per piattaforma cybersecurity enterprise. 100% remoto da Italia, stock options, hardware fornito. Nice to have: SwiftUI, design systems.",
      url: "https://example.com/jobs/nozomi-fe",
      contractType: "permanent",
      remote: true,
      salaryMin: 50000,
      salaryMax: 65000,
      category: "IT Jobs",
      postedAt: new Date(Date.now() - 3 * 86400_000),
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
    {
      id: "",
      source: "mock",
      title: "Product Designer Senior",
      company: "Prima Assicurazioni",
      location: "Milano, Italia",
      description:
        "Product Designer Senior per redesign del flusso quote. Figma, design system maturity, research fluency. 5+ anni di esperienza. Ibrido 3/2.",
      url: "https://example.com/jobs/prima-design",
      contractType: "permanent",
      remote: false,
      salaryMin: 55000,
      salaryMax: 75000,
      category: "Design Jobs",
      postedAt: new Date(Date.now() - 4 * 86400_000),
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
    {
      id: "",
      source: "mock",
      title: "Receptionist — Stagione estiva",
      company: "Hotel Bellaria Resort",
      location: "Lecce, Italia",
      description:
        "Cercasi receptionist per stagione estiva maggio-settembre. Inglese B2, orientamento al cliente. Vitto e alloggio inclusi. Ottime opportunità di crescita.",
      url: "https://example.com/jobs/bellaria-receptionist",
      contractType: "contract",
      remote: false,
      salaryMin: 18000,
      salaryMax: 22000,
      category: "Hospitality",
      postedAt: new Date(Date.now() - 5 * 86400_000),
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
    {
      id: "",
      source: "mock",
      title: "Data Scientist — NLP & GenAI",
      company: "Capgemini Italia",
      location: "Milano / Roma",
      description:
        "Cerchiamo Data Scientist specializzato in NLP e Generative AI. Python, RAG, LangChain, cloud deployment (Azure/AWS). Almeno 2 anni di esperienza. Ibrido.",
      url: "https://example.com/jobs/capgemini-ds",
      contractType: "permanent",
      remote: false,
      salaryMin: 40000,
      salaryMax: 65000,
      category: "IT Jobs",
      postedAt: new Date(Date.now() - 6 * 86400_000),
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
    {
      id: "",
      source: "mock",
      title: "Addetto magazzino — Milano",
      company: "Amazon XL",
      location: "Milano, Italia",
      description:
        "Ricerchiamo addetti magazzino per centro di distribuzione a Milano. Turni flessibili, contratto a tempo determinato 6 mesi con possibilità di proroga.",
      url: "https://example.com/jobs/amazon-warehouse",
      contractType: "contract",
      remote: false,
      salaryMin: 22000,
      salaryMax: 26000,
      category: "Logistics",
      postedAt: new Date(Date.now() - 7 * 86400_000),
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
    {
      id: "",
      source: "mock",
      title: "Senior Backend Engineer — Go / Rust",
      company: "Scalapay",
      location: "Milano / Remote IT",
      description:
        "Senior Backend Engineer su sistemi distribuiti ad alta scala. Go o Rust, PostgreSQL, Kafka. 5+ anni di esperienza su sistemi production. Stock options + salary top tier.",
      url: "https://example.com/jobs/scalapay-be",
      contractType: "permanent",
      remote: true,
      salaryMin: 70000,
      salaryMax: 95000,
      category: "IT Jobs",
      postedAt: new Date(Date.now() - 1 * 86400_000),
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
    {
      id: "",
      source: "mock",
      title: "UX Researcher",
      company: "Lottomatica",
      location: "Roma, Italia",
      description:
        "UX Researcher per prodotti digitali consumer. Qualitativa + quantitativa. 3+ anni di esperienza. Ibrido Roma.",
      url: "https://example.com/jobs/lottomatica-ux",
      contractType: "permanent",
      remote: false,
      salaryMin: 35000,
      salaryMax: 48000,
      category: "Design Jobs",
      postedAt: new Date(Date.now() - 2 * 86400_000),
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
    {
      id: "",
      source: "mock",
      title: "DevOps Engineer — Kubernetes",
      company: "Sky Italia",
      location: "Milano, Italia",
      description:
        "DevOps Engineer su Kubernetes + Terraform + GitLab CI. 4+ anni di esperienza. Ambiente enterprise, grande scala.",
      url: "https://example.com/jobs/sky-devops",
      contractType: "permanent",
      remote: false,
      salaryMin: 45000,
      salaryMax: 60000,
      category: "IT Jobs",
      postedAt: new Date(Date.now() - 3 * 86400_000),
      recruiterEmail: null,
      recruiterScrapedAt: null,
    },
  ];

  const what = (params.what ?? "").toLowerCase();
  const where = (params.where ?? "").toLowerCase();
  return seed
    .filter((j) => {
      if (what && !`${j.title} ${j.description} ${j.company}`.toLowerCase().includes(what))
        return false;
      if (where && !(j.location ?? "").toLowerCase().includes(where))
        return false;
      return true;
    })
    .map((j, i) => ({ ...j, externalId: `mock-${i + 1}` }));
}
