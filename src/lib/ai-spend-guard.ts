import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

/**
 * Budget gate per l'auto-apply.
 *
 * TypeSafe esprime un giudizio piccolo e strutturato prima di inviare CV e
 * annuncio al modello che riscrive documenti. Il gate è volutamente
 * conservativo: quando il servizio non è configurato, è incerto o va in
 * errore, lascia proseguire la candidatura. Blocca solo incompatibilità
 * palesi ad alta confidenza, quindi non trasforma un problema di provider in
 * candidature perse.
 *
 * È opt-in per ambiente: richiede TYPESAFE_API_KEY e
 * TYPESAFE_AI_GUARD_ENABLED=true. In questo modo non introduce costi o
 * dipendenze inattese finché non è stato attivato consapevolmente.
 */

type SpendGuardInput = {
  job: {
    title: string;
    company?: string | null;
    location?: string | null;
    description?: string | null;
    category?: string | null;
    remote?: boolean | null;
  };
  preferences?: {
    rolesJson?: string | null;
    locationsJson?: string | null;
    employmentType?: string | null;
    protectedCategory?: boolean | null;
  } | null;
};

export type SpendGuardDecision =
  | { action: "continue"; reason: "disabled" | "uncertain" | "error" }
  | { action: "skip"; reason: "clear_mismatch" };

function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

export async function guardExpensiveTailoring(input: SpendGuardInput): Promise<SpendGuardDecision> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey || process.env.TYPESAFE_AI_GUARD_ENABLED !== "true") {
    return { action: "continue", reason: "disabled" };
  }

  const client = new TypeSafeClient({
    apiKey,
    timeout: 3000,
    // Un giudizio in ritardo non deve tenere una candidatura in coda né
    // generare richieste duplicate al provider.
    retry: { maxRetries: 0 },
  });

  try {
    const response = await client.systemOne({
      state: {
        candidate: {
          target_roles: parseList(input.preferences?.rolesJson),
          target_locations: parseList(input.preferences?.locationsJson),
          employment_type: input.preferences?.employmentType ?? "employee",
          protected_category: input.preferences?.protectedCategory ?? false,
        },
        job: {
          title: input.job.title,
          company: input.job.company ?? null,
          location: input.job.location ?? null,
          category: input.job.category ?? null,
          remote: input.job.remote ?? false,
          // È sufficiente l'incipit per distinguere ruoli palesemente
          // incompatibili; non inviamo CV o interi documenti personali.
          description_excerpt: (input.job.description ?? "").slice(0, 3500),
        },
      },
      questions: {
        routing: choice(
          "Decidi se vale la pena spendere una generazione CV/lettera per questa candidatura automatica. Scegli skip solo quando il ruolo è chiaramente incompatibile con ruoli, località, tipo di lavoro o requisiti dichiarati dal candidato. Se mancano dati o il match è plausibile, scegli continue.",
          {
            continue: "Il lavoro è plausibilmente compatibile, oppure le informazioni non bastano per scartarlo in sicurezza.",
            skip: "Il lavoro è chiaramente incompatibile; generare CV e lettera sarebbe uno spreco e non aiuterebbe il candidato.",
          },
        ),
      },
    });

    const answer = response.answers.routing;
    // Soglia alta: l'utente preferisce preservare una candidatura dubbia
    // rispetto a risparmiare pochi centesimi su un falso negativo.
    if (
      answer.choice === "skip" &&
      answer.probabilities.skip >= 0.92 &&
      answer.confidence >= 0.8
    ) {
      return { action: "skip", reason: "clear_mismatch" };
    }
    return { action: "continue", reason: "uncertain" };
  } catch (error) {
    console.warn("[ai-spend-guard] TypeSafe non disponibile; candidatura lasciata proseguire", error instanceof Error ? error.message : error);
    return { action: "continue", reason: "error" };
  }
}
