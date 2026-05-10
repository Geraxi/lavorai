import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Wrappers locale-aware per Link, useRouter, redirect, ecc.
 * Usare al posto degli import da "next/link" / "next/navigation"
 * nei componenti client che devono restare consistenti col locale.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
