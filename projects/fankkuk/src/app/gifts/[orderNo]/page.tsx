import { notFound, redirect } from "next/navigation";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { isOrderNo } from "@/entities/order/model/order-no";
import { GiftStatusPage } from "@/widgets/gift-status/ui/gift-status-page";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

// 선물 하나. 읽기 함수가 로그인한 팬의 주문만 돌려주므로 남의 주문번호는 없는 주소와 같다.
// 헤더도 같은 목록을 쓰므로 목록을 한 번 읽어 둘 다에 넘긴다.
export default async function Page({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const { supabase, viewer } = await loadSession();
  if (viewer?.role !== "fan") redirect("/login");
  const gifts = await readMyGiftViews(supabase);
  const view = isOrderNo(orderNo) ? gifts.find((g) => g.orderNo === orderNo) : undefined;
  if (!view) notFound();
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/gifts", gifts)} />
      <GiftStatusPage view={view} />
      <SiteFooter />
    </>
  );
}
