import type { Metadata } from "next";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { termsDoc } from "@/widgets/legal/model/terms-doc";
import { LegalPage } from "@/widgets/legal/ui/legal-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "이용약관 — 팬꾹" };

// 로그인 없이 열린다. 헤더만 로그인한 사람에 맞춘다(about·support 와 같다).
// 요금 숫자는 결제와 같은 DB 요금표에서 읽는다 — 약관과 실제 결제 금액이 갈라지지 않게.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const [header, prices] = await Promise.all([readSiteHeader(supabase, viewer, "/terms"), readPublicPrices(supabase)]);
  return (
    <>
      <SiteHeader {...header} />
      <LegalPage doc={termsDoc(prices)} icon="/img/icon-notice.png" />
      <SiteFooter />
    </>
  );
}
