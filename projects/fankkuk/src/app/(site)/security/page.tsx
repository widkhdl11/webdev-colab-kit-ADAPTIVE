import type { Metadata } from "next";
import { SECURITY_DOC, SECURITY_FLOW } from "@/widgets/legal/model/security-doc";
import { LegalPage } from "@/widgets/legal/ui/legal-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "보안 안내 — 팬꾹" };

// 로그인 없이 열린다. 헤더만 로그인한 사람에 맞춘다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const header = await readSiteHeader(supabase, viewer, "/security");
  return (
    <>
      <SiteHeader {...header} />
      <LegalPage tab="security" doc={SECURITY_DOC} flow={SECURITY_FLOW} flowLabel="주소 열람 시점" icon="/img/icon-address-lock.png" />
      <SiteFooter />
    </>
  );
}
