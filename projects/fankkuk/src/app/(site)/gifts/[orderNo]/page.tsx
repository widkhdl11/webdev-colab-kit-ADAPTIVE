import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readActionItemsOrNull, readCreatorActionItemsOrNull } from "@/entities/action-item/api/read-action-items";
import { actionItemsOfOrder, differenceDueKrw, type ActionItem } from "@/entities/action-item/model/action-items";
import { sentGiftTodoOf } from "@/entities/action-item/model/creator-action-items";
import { readMyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";
import { readMyGiftReplies } from "@/entities/gift-reply/api/gift-reply-reads";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { readMyGiftMemo } from "@/entities/order/api/my-gift-memo";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { readMyGiftBoxes } from "@/entities/parcel/api/box-reads";
import { readMyDifferences } from "@/entities/payment/api/read-my-differences";
import { readMyGiftPayment } from "@/entities/payment/api/read-my-gift-payment";
import { isOrderNo } from "@/entities/order/model/order-no";
import { readMyRevgiftAccessLog, readReceivedRevgift } from "@/entities/revgift/api/revgift-reads";
import { isRevgiftOrderNo } from "@/entities/revgift/model/revgift-order-no";
import type { Viewer } from "@/entities/session/model/viewer";
import { senderRoleAllowed } from "@/features/gift-register/model/sender-rule";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { GiftTodoBox } from "@/widgets/action-center/ui/gift-todo-box";
import { UnpaidGiftPage } from "@/widgets/action-center/ui/unpaid-gift-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { GiftStatusPage } from "@/widgets/gift-status/ui/gift-status-page";
import { RevgiftReceivePage } from "@/widgets/revgift-receive/ui/revgift-receive-page";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

// 선물 상세 하나 (action-center INV-J12) — 팬이 보낸 선물(FC-…)도, 팬이 받은 역조공 몫(RG-…)도 이 주소 하나다.
// 주문번호 앞머리로 읽기 함수를 고르고, 누구 것인지는 두 읽기 함수가 각각 로그인 토큰으로 판정한다:
//   FC = 로그인한 사람이 보낸 주문만 돌려주는 목록 읽기(my_gifts) · RG = 로그인한 팬이 받는 몫만 돌려주는 받은 역조공 읽기.
// 그 밖(남의 것·없는 것·형식이 틀린 것·받는 팬이 아닌 계정이 연 RG)은 모두 같은 notFound — 있는지 없는지 드러나지 않는다.
// 맨 위 「지금 할 일」 칸(INV-J13)은 처리할 일 읽기 결과를 이 주문으로 거른 줄로만 그린다. 한 번 읽어 사이드바 숫자와 함께 쓴다(INV-J2).
// 처리할 일을 읽지 못하면 숫자와 칸이 함께 빠지고 상세는 그린다.

type Session = { supabase: SupabaseClient; viewer: Viewer };

const DIFFERENCE_NOTICES = ["paid", "failed", "in_progress", "closed"] as const;

/** 받은 역조공 몫 — 받는 팬 본인만(읽기 함수가 판정). 크리에이터·운영자 계정에게는 팬 상세가 없다 */
async function revgiftDetail({ supabase, viewer }: Session, orderNo: string) {
  if (viewer.role !== "fan") notFound();
  // 넷은 서로 기다릴 일이 없다 — 남의 몫이면 기록 읽기도 빈 목록이라 먼저 불러도 새는 것이 없다
  const [item, accessLog, address, actions] = await Promise.all([
    readReceivedRevgift(supabase, orderNo),
    readMyRevgiftAccessLog(supabase, orderNo),
    readMyFanAddressStatus(supabase).catch(() => null),
    readActionItemsOrNull(supabase),
  ]);
  if (!item) notFound();
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/me/revgifts", actions)} />
      <RevgiftReceivePage
        item={item}
        todo={actions !== null && actionItemsOfOrder(actions, item.orderNo).length > 0}
        nowMs={Date.now()}
        accountId={viewer.userId}
        address={address}
        sealingKeyPem={readSealingPublicKeyPem(process.env)}
        accessLog={accessLog}
      />
      <SiteFooter />
    </>
  );
}

/**
 * 보낸 선물 상세의 맨 위 칸과 사이드바 숫자가 함께 쓰는 지금 할 일 읽기 한 번(action-center INV-J2·J6·J13).
 * 팬 = 팬 지금 할 일 읽기, 크리에이터 = 크리에이터 지금 할 일 읽기(보낸 팬 선물의 결제 대기·추가 결제·상자 찾기가 칸이 된다 — INV-J13 · payment INV-M22 ⑤).
 * header 는 사이드바 숫자에 넘기는 그 결과 그대로다(못 읽으면 null — 숫자와 칸이 함께 빠진다).
 */
async function readDetailTodo(supabase: SupabaseClient, viewer: Viewer, orderNo: string): Promise<{ header: readonly unknown[] | null; items: ActionItem[] }> {
  if (viewer.role === "fan") {
    const actions = await readActionItemsOrNull(supabase);
    return { header: actions, items: actions ? actionItemsOfOrder(actions, orderNo) : [] };
  }
  const created = await readCreatorActionItemsOrNull(supabase);
  return { header: created, items: created ? sentGiftTodoOf(created, orderNo) : [] };
}

/** 보낸 선물 — 보낸 사람(팬·크리에이터) 본인만. 목록 읽기가 로그인한 사람이 보낸 주문만 돌려주므로 남의 주문번호는 없는 주소와 같다 */
async function giftDetail({ supabase, viewer }: Session, orderNo: string, differenceParam: string | string[] | undefined, paid: boolean) {
  const gifts = await readMyGiftViews(supabase);
  const view = gifts.find((g) => g.orderNo === orderNo);
  if (!view) return unpaidDetail({ supabase, viewer }, orderNo, gifts);
  const fan = viewer.role === "fan";
  // 서로 기다릴 필요가 없어 함께 읽는다. 상자·차액·결제·답장·메모 읽기는 모두 로그인한 사람의 주문이 아니면 빈 값을 준다.
  // 처리할 일과 받을 주소 상태(반송 주소 확인 창 — 이름표·바꾼 날만, address-protection INV-P16)는 팬만
  const [boxes, differences, payment, replies, memo, actions, addressStatus] = await Promise.all([
    readMyGiftBoxes(supabase, view.orderNo),
    readMyDifferences(supabase, view.orderNo),
    readMyGiftPayment(supabase, view.orderNo),
    readMyGiftReplies(supabase, view.orderNo),
    readMyGiftMemo(supabase, view.orderNo),
    readDetailTodo(supabase, viewer, view.orderNo),
    fan ? readMyFanAddressStatus(supabase).catch(() => null) : Promise.resolve(null),
  ]);
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
  const notice = DIFFERENCE_NOTICES.find((n) => n === differenceParam) ?? null;
  const todoItems = actions.items;
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/gifts", actions.header)} />
      <GiftStatusPage
        view={view}
        boxes={boxes}
        difference={{ differences, notice }}
        dueKrw={differenceDueKrw(todoItems)}
        // 결제를 마치고 돌아온 직후 — 결제 성공 뒤 서버가 `?paid=1` 로 보낸다(api/checkout/success). 안내 줄 하나만 바뀐다(UX 시범 B-1)
        paid={paid}
        payment={payment}
        replies={replies}
        photoBase={readPublicStorageBase()}
        memo={memo}
        // 칸의 「도착이 늦어요」에 있는 상자는 아래 찾기 구간에서 뺀다(INV-J13) — 같은 읽기 결과에서
        todoBoxIds={todoItems.flatMap((it) => (it.kind === "missing_box" ? [it.boxId] : []))}
        todo={
          todoItems.length > 0 ? (
            <GiftTodoBox
              items={todoItems}
              clientKey={clientKey}
              now={new Date().toISOString()}
              address={{ accountId: viewer.userId, status: addressStatus, sealingKeyPem: readSealingPublicKeyPem(process.env) }}
            />
          ) : null
        }
      />
      <SiteFooter />
    </>
  );
}

/**
 * 결제를 마치지 않은 선물(payment INV-M22 ⑤) — 보낸 선물 읽기에는 결제가 끝난 주문만 있다. 지금 할 일 읽기(팬·크리에이터 각자, 로그인 토큰의 계정이 보낸 주문만, INV-J3)가
 * 이 주문의 「결제 미완료」 줄을 돌려줄 때만 연다 — 그 밖(남의 것·없는 것·닫힌 결제 대기)은 똑같이 notFound(INV-J12).
 */
async function unpaidDetail({ supabase, viewer }: Session, orderNo: string, gifts: Awaited<ReturnType<typeof readMyGiftViews>>) {
  if (viewer.role !== "fan" && viewer.role !== "creator") notFound();
  const actions = await readDetailTodo(supabase, viewer, orderNo);
  const todoItems = actions.items;
  const unpaid = todoItems.find((it) => it.kind === "unpaid");
  if (!unpaid) notFound();
  const addressStatus = viewer.role === "fan" ? await readMyFanAddressStatus(supabase).catch(() => null) : null;
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/gifts", actions.header)} />
      {/* 지금 할 일(목록형 880)의 「바로 하기」로 오는 화면 — 같은 폭이라야 같은 칸이 같은 크기로 보인다(2026-10-26 사용자) */}
      <MyShell width="list">
        <UnpaidGiftPage
          items={todoItems}
          creatorName={unpaid.creatorName}
          orderNo={orderNo}
          clientKey={process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? ""}
          now={new Date().toISOString()}
          address={{ accountId: viewer.userId, status: addressStatus, sealingKeyPem: readSealingPublicKeyPem(process.env) }}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderNo: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { orderNo } = await params;
  const { difference, paid } = await searchParams;
  const { supabase, viewer } = await loadSession();
  if (!viewer || !senderRoleAllowed(viewer.role)) redirect("/login");
  if (isRevgiftOrderNo(orderNo)) return revgiftDetail({ supabase, viewer }, orderNo);
  if (isOrderNo(orderNo)) return giftDetail({ supabase, viewer }, orderNo, difference, paid === "1");
  notFound();
}
