import { redirect } from "next/navigation";
import { readTierPrices } from "@/entities/payment/api/read-tier-prices";
import { LandingPage } from "@/widgets/landing/ui/landing-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, signedInHome } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 소개 첫 화면. 로그인된 상태면 바로 메인으로(PRODUCT ③). 손님 헤더로 남겨 두면 로그인이 풀린 것처럼 보인다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const home = signedInHome(viewer);
  if (home) redirect(home);
  const prices = await readTierPrices(supabase);
  return (
    <>
      <SiteHeader role="guest" current="/" />
      <LandingPage prices={prices} />
      <SiteFooter />
    </>
  );
}
