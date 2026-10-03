import { readTierPrices } from "@/entities/payment/api/read-tier-prices";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SupportPage } from "@/widgets/support/ui/support-page";

export const dynamic = "force-dynamic";

// 누구나 보는 화면이지만 헤더는 로그인한 사람에 맞춘다 — 손님 헤더로 고정하면 로그인이 풀린 것처럼 보인다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const [header, prices] = await Promise.all([readSiteHeader(supabase, viewer, "/support"), readTierPrices(supabase)]);
  return (
    <>
      <SiteHeader {...header} />
      <SupportPage prices={prices} />
      <SiteFooter />
    </>
  );
}
