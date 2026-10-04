import { redirect } from "next/navigation";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { RevgiftSendPage } from "@/widgets/revgift-send/ui/revgift-send-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

const PAYMENT_NOTICE: Record<string, string> = {
  failed: "결제를 마치지 못해 역조공이 보내지지 않았어요. 받을 팬을 다시 추가해 주세요.",
  in_progress: "같은 결제를 처리하는 중이에요. 잠시 뒤 보낸 역조공을 확인해 주세요.",
};

// 역조공 보내기(크리에이터만). 받는 팬은 아이디를 정확히 입력해 한 명씩 찾는다 — 팔로워 목록은 읽지도 넘기지도 않는다(INV-R2).
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { payment } = await searchParams;
  const { supabase, viewer } = await loadSession();
  if (viewer?.role !== "creator") redirect("/login");
  const notice = typeof payment === "string" ? PAYMENT_NOTICE[payment] : undefined;
  const prices = await readPublicPrices(supabase);
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
  if (!clientKey) console.warn("NEXT_PUBLIC_TOSS_CLIENT_KEY 가 없어 결제창을 열 수 없다");
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/creator/revgifts")} />
      <RevgiftSendPage clientKey={clientKey} prices={prices} notice={notice} />
      <SiteFooter />
    </>
  );
}
