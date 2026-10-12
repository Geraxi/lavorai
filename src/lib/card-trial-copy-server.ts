import { cache } from "react";
import { getPersistedCardTrialCutoff } from "@/lib/card-trial-cohort";
import { getPublicCardTrialCopy } from "@/lib/card-trial-copy";

/** Request-scoped resolution. Persistent launch terms survive configuration loss. */
export const getResolvedPublicCardTrialCopy = cache(async (locale: string = "it") => {
  const cutoff = await getPersistedCardTrialCutoff();
  const active = !!cutoff && cutoff.getTime() <= Date.now();
  return getPublicCardTrialCopy(locale, active);
});
