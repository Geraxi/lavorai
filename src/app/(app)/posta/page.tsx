import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { AppTopbar } from "@/components/design/topbar";
import { getCurrentUser } from "@/lib/session";
import { listMailboxThreads } from "@/lib/application-mailbox-store";
import { PostaView } from "@/components/posta-view";
import "./posta.css";

export const metadata: Metadata = { title: "Posta candidature" };
export const dynamic = "force-dynamic";

export default async function PostaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/posta");
  const locale = await getLocale();
  const threads = await listMailboxThreads(user.id, locale);
  return (
    <>
      <AppTopbar title="Posta candidature" breadcrumb={locale === "en" ? "Work" : "Lavoro"} />
      <PostaView locale={locale} threads={threads} />
    </>
  );
}
