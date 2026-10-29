import type { Metadata } from "next";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { guideFanDoc } from "@/widgets/legal/model/guide-fan-doc";
import { LegalPage } from "@/widgets/legal/ui/legal-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "팬 이용 안내 — 팬꾹" };

// 로그인 없이 열린다. 헤더만 로그인한 사람에 맞춘다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const [header, prices] = await Promise.all([readSiteHeader(supabase, viewer, "/guide/fan"), readPublicPrices(supabase)]);
  return (
    <>
      <SiteHeader {...header} />
      <LegalPage tab="guide-fan" doc={guideFanDoc(prices)} icon="/img/icon-notice.png" />
      <SiteFooter />
    </>
  );
}
