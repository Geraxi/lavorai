/**
 * Shape del JSON restituito da Claude dopo l'ottimizzazione CV.
 * Deve combaciare esattamente con lo schema descritto in
 * src/lib/prompts/cv-optimization.ts — qualsiasi modifica qui richiede
 * aggiornamento parallelo del prompt.
 */

export interface Experience {
  role: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string; // formato libero oppure "Presente"
  bullets: string[];
}

export interface Education {
  degree: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  notes: string | null;
}

export interface Skills {
  technical: string[];
  soft: string[];
  tools: string[];
}

export interface Language {
  language: string;
  /** Livello CEFR: A1 / A2 / B1 / B2 / C1 / C2 / Madrelingua */
  level: string;
}

export interface OptimizedCVData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string | null;
  summary: string;
  experiences: Experience[];
  education: Education[];
  skills: Skills;
  languages: Language[];
}

export interface OptimizationResult {
  optimizedCV: OptimizedCVData;
  coverLetter: string;
  /** 0-100 */
  atsScore: number;
  /** 3-5 suggerimenti testuali */
  suggestions: string[];
}
