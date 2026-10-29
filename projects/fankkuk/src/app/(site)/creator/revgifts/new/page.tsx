import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { readRevgiftFollowers } from "@/entities/revgift/api/revgift-reads";
import { RevgiftSendPage } from "@/widgets/revgift-send/ui/revgift-send-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "팬에게 보내기 — 팬꾹" };

const PAYMENT_NOTICE: Record<string, string> = {
  failed: "결제가 완료되지 않았습니다. 다시 진행하려면 받을 팬을 선택해 주세요.",
  in_progress: "결제를 처리 중입니다. 잠시 후 ‘보낸 역조공’에서 결과를 확인해 주세요.",
};

// 역조공 보내기(크리에이터만). 받는 팬은 나를 팔로우하는 팬 목록에서 고른다(INV-R2) — 목록은 로그인 토큰으로 DB 가 내 팔로워만 돌려준다.
// 고른 팬이 지금도 팔로워인지는 등록 때 DB 가 다시 판정한다(INV-R1).
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { payment } = await searchParams;
  const { supabase, viewer } = await loadSession();
  if (viewer?.role !== "creator") redirect("/login");
  const notice = typeof payment === "string" ? PAYMENT_NOTICE[payment] : undefined;
  const [prices, followers] = await Promise.all([readPublicPrices(supabase), readRevgiftFollowers(supabase)]);
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
  if (!clientKey) console.warn("NEXT_PUBLIC_TOSS_CLIENT_KEY 가 없어 결제창을 열 수 없다");
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/creator/revgifts/new")} />
      <RevgiftSendPage clientKey={clientKey} prices={prices} followers={followers} notice={notice} />
      <SiteFooter />
    </>
  );
}
