"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { NewSearchDialog } from "@/components/new-search-dialog";

export function NewSearchButton({ locale = "it" }: { locale?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ds-btn pm-topbar-btn"
        onClick={() => setOpen(true)}
      >
        <Plus size={14} strokeWidth={1.75} aria-hidden /> {locale === "en" ? "New search" : "Nuova ricerca"}
      </button>
      <NewSearchDialog locale={locale} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
