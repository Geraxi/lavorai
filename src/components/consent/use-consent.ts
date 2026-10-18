"use client";

import { useSyncExternalStore } from "react";
import { getConsentSnapshot, getServerConsentSnapshot, subscribeConsent, type ConsentSnapshot } from "@/lib/consent/client-store";

export function useConsent(): ConsentSnapshot {
  return useSyncExternalStore(subscribeConsent, getConsentSnapshot, getServerConsentSnapshot);
}
