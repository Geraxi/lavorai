/**
 * Admin reporting catalog v1. Exact matches only, after cosmetic normalization.
 * This is a deliberately incomplete display allowlist, not the sourcing catalog.
 * Never display unknown text or infer its meaning, even if it contains a known role.
 * Areas describe occupations, not an employer industry or a user-selected sector.
 * Italian/English titles remain separate roles; there is no synonym merging.
 */
export const ADMIN_ROLE_TAXONOMY = {
  "Design e creatività": [
    "Graphic designer", "Visual designer", "Art director", "Brand designer", "Product designer",
    "UX designer", "UI designer", "UX/UI designer", "UI/UX designer", "Web designer", "Motion designer",
    "Interaction designer", "Service designer", "Interior designer", "Fashion designer", "Industrial designer",
    "Creative director", "Illustratore", "Illustrator", "Grafico", "Fotografo", "Photographer", "Video editor",
  ],
  "Sviluppo software e IT": [
    "Software developer", "Software engineer", "Sviluppatore software", "Sviluppatore web", "Web developer",
    "Frontend developer", "Front-end developer", "Backend developer", "Back-end developer", "Full stack developer",
    "Full-stack developer", "Mobile developer", "DevOps engineer", "Cloud engineer", "System administrator",
    "Sistemista", "IT support specialist", "Cybersecurity analyst", "Security engineer", "QA engineer",
  ],
  "Dati e analisi": ["Data analyst", "Data scientist", "Data engineer", "Business analyst", "Machine learning engineer", "Analista dati"],
  "Marketing e comunicazione": [
    "Marketing manager", "Digital marketing specialist", "Social media manager", "Content manager", "Content creator",
    "Copywriter", "SEO specialist", "Communication specialist", "Addetto marketing", "Addetto comunicazione",
  ],
  "Vendite e assistenza clienti": [
    "Sales manager", "Account manager", "Sales account manager", "Sales representative", "Business development manager",
    "Customer success manager", "Customer service representative", "Customer support specialist", "Export manager",
    "Commerciale", "Agente di commercio", "Addetto assistenza clienti", "Addetto vendite", "Commesso", "Store manager",
  ],
  "Amministrazione e finanza": [
    "Contabile", "Accountant", "Financial analyst", "Finance manager", "Controller", "Impiegato amministrativo",
    "Assistente amministrativo", "Administrative assistant", "Office manager", "Segretario", "Segretaria", "Commercialista",
  ],
  "Risorse umane": ["HR manager", "HR specialist", "Recruiter", "Talent acquisition specialist", "HR generalist", "Addetto risorse umane"],
  "Prodotto, progetti e operazioni": ["Product manager", "Product owner", "Project manager", "Program manager", "Operations manager", "Scrum master"],
  "Ingegneria e manutenzione": [
    "Ingegnere meccanico", "Ingegnere civile", "Ingegnere elettronico", "Ingegnere elettrico", "Ingegnere chimico",
    "Mechanical engineer", "Civil engineer", "Electrical engineer", "Architetto", "Architect", "Geometra",
    "Operaio", "Operaio specializzato", "Manutentore", "Elettricista", "Idraulico", "Saldatore", "Energy manager",
  ],
  "Logistica e trasporti": ["Magazziniere", "Autista", "Corriere", "Logistics manager", "Supply chain manager", "Buyer", "Procurement specialist", "Addetto logistica"],
  "Ristorazione e accoglienza": ["Cameriere", "Cuoco", "Chef", "Barista", "Receptionist", "Hotel manager", "Restaurant manager", "Addetto pulizie"],
  "Professioni sanitarie e laboratorio": [
    "Medico", "Infermiere", "Infermiera", "Operatore socio sanitario", "Fisioterapista", "Farmacista",
    "Tecnico di laboratorio biomedico", "Tecnico sanitario di laboratorio biomedico", "Biologo", "Biotecnologo", "Chimico", "Psicologo",
  ],
  "Formazione, ricerca e servizi professionali": [
    "Insegnante", "Docente", "Educatore", "Ricercatore universitario", "Research scientist", "Avvocato", "Legal counsel",
    "Agronomo", "Assistente sociale", "Traduttore", "Translator", "Meteorologo", "Analista climatico",
  ],
} as const;

export function normalizeAdminRole(role: string): string {
  return role.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

const catalog = new Map(Object.entries(ADMIN_ROLE_TAXONOMY).flatMap(([area, roles]) =>
  roles.map((role) => [normalizeAdminRole(role), { role, area }] as const),
));

export function classifyAdminRole(value: string) {
  return catalog.get(normalizeAdminRole(value)) ?? null;
}
