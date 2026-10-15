import { notFound, redirect } from "next/navigation";
import { readMyGiftReplies } from "@/entities/gift-reply/api/gift-reply-reads";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { readMyGiftMemo } from "@/entities/order/api/my-gift-memo";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { readMyGiftBoxes } from "@/entities/parcel/api/box-reads";
import { readMyDifferences } from "@/entities/payment/api/read-my-differences";
import { readMyGiftPayment } from "@/entities/payment/api/read-my-gift-payment";
import { isOrderNo } from "@/entities/order/model/order-no";
import { senderRoleAllowed } from "@/features/gift-register/model/sender-rule";
import { GiftStatusPage } from "@/widgets/gift-status/ui/gift-status-page";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

// 선물 하나 — 보낸 사람(팬·크리에이터)이 본다. 읽기 함수가 로그인한 사람이 보낸 주문만 돌려주므로 남의 주문번호는 없는 주소와 같다.
// 헤더도 같은 목록을 쓰므로 목록을 한 번 읽어 둘 다에 넘긴다.
const DIFFERENCE_NOTICES = ["paid", "failed", "in_progress", "closed"] as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderNo: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { orderNo } = await params;
  const { difference: differenceParam } = await searchParams;
  const { supabase, viewer } = await loadSession();
  if (!viewer || !senderRoleAllowed(viewer.role)) redirect("/login");
  const gifts = await readMyGiftViews(supabase);
  const view = isOrderNo(orderNo) ? gifts.find((g) => g.orderNo === orderNo) : undefined;
  if (!view) notFound();
  // 셋은 서로 기다릴 필요가 없어 함께 읽는다.
  // 상자별 원 송장번호·상태 — 읽기 함수가 로그인한 사람의 주문이 아니면 빈 목록을 준다. 출고 운송장은 오지 않는다.
  // 상자별 차액 요청(payment INV-M11) — 읽기 함수가 로그인한 사람의 주문이 아니면 빈 목록을 준다
  // 결제 금액(payment INV-M14) — 결제할 때 저장한 값. 읽기 함수가 로그인한 사람의 결제 완료 주문이 아니면 null 을 준다
  // 출고된 상자별 받았어요·답장(gift-reply INV-G6) — 읽기 함수가 로그인한 사람이 보낸 주문이 아니면 빈 목록을 준다. 날짜만 온다
  // 나만 보는 메모(together INV-F8) — 읽기 함수가 로그인한 사람이 보낸 주문이 아니면 null 을 준다
  const [boxes, differences, payment, replies, memo] = await Promise.all([
    readMyGiftBoxes(supabase, view.orderNo),
    readMyDifferences(supabase, view.orderNo),
    readMyGiftPayment(supabase, view.orderNo),
    readMyGiftReplies(supabase, view.orderNo),
    readMyGiftMemo(supabase, view.orderNo),
  ]);
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
  const notice = DIFFERENCE_NOTICES.find((n) => n === differenceParam) ?? null;
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/gifts", gifts)} />
      <GiftStatusPage
        view={view}
        boxes={boxes}
        difference={{ differences, clientKey, notice }}
        payment={payment}
        replies={replies}
        photoBase={readPublicStorageBase()}
        memo={memo}
      />
      <SiteFooter />
    </>
  );
}
