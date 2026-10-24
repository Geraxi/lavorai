/** Map CVProfile + User fields onto Ashby Name / Phone / LinkedIn inputs. */

export function ashbyContactFromProfile(input: {
  profile: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    links?: Array<{ url?: string | null; label?: string | null }>;
  };
  userName?: string | null;
  userPhone?: string | null;
  linkedinUrl?: string | null;
}): { fullName: string; firstName: string; lastName: string; phone: string; linkedinUrl: string } {
  const first = input.profile.firstName?.trim() || "";
  const last = input.profile.lastName?.trim() || "";
  let fullName = [first, last].filter(Boolean).join(" ").trim();
  if (!fullName && input.userName?.trim()) fullName = input.userName.trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const fromLinks = input.profile.links?.find((l) => /linkedin/i.test(`${l.label ?? ""} ${l.url ?? ""}`))?.url?.trim();
  return {
    fullName,
    firstName: first || parts[0] || "",
    lastName: last || parts.slice(1).join(" ") || "",
    phone: (input.profile.phone?.trim() || input.userPhone?.trim() || ""),
    linkedinUrl: fromLinks || input.linkedinUrl?.trim() || "",
  };
}
