"use client";

import { useState } from "react";
import { Icon } from "@/components/design/icon";
import { NewSearchDialog } from "@/components/new-search-dialog";

export function NewSearchButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ds-btn"
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size={14} /> Nuova ricerca
      </button>
      <NewSearchDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
