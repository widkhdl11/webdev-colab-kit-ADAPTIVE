import type { Metadata } from "next";
import { INSPECTION_DOC } from "@/widgets/legal/model/inspection-doc";
import { LegalPage } from "@/widgets/legal/ui/legal-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "검수 기준 — 팬꾹" };

// 로그인 없이 열린다. 헤더만 로그인한 사람에 맞춘다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const header = await readSiteHeader(supabase, viewer, "/inspection");
  return (
    <>
      <SiteHeader {...header} />
      <LegalPage doc={INSPECTION_DOC} icon="/img/icon-notice.png" />
      <SiteFooter />
    </>
  );
}
