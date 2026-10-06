import type { Metadata } from "next";
import { PRIVACY_DOC } from "@/widgets/legal/model/privacy-doc";
import { LegalPage } from "@/widgets/legal/ui/legal-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "개인정보처리방침 — 팬꾹" };

// 로그인 없이 열린다. 헤더만 로그인한 사람에 맞춘다(about·support 와 같다).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const header = await readSiteHeader(supabase, viewer, "/privacy");
  return (
    <>
      <SiteHeader {...header} />
      <LegalPage doc={PRIVACY_DOC} icon="/img/icon-address-lock.png" />
      <SiteFooter />
    </>
  );
}
