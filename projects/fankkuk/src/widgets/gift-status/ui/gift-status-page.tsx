import { statusTagClass } from "@/shared/ui/status-tone";
import { DIFFERENCE_DEADLINE_DAYS } from "@/entities/payment/config/difference-deadline";
import Link from "next/link";
import type { ReactNode } from "react";
import { withApprovalDeadline, withDeliveryStage, type FanGiftView, type FanStep } from "@/entities/order/model/fan-view";
import type { DeliveryStatusSource } from "@/shared/config/delivery-status";
import { deliveryStage, isEstimatedStage } from "@/shared/lib/delivery/delivery-stage";
import {
  APPROVAL_LABEL,
  awaitsApproval,
  FAN_STEP_LABEL,
  fanDetailBadges,
  fanHeadline,
  fanProgress,
  fanStepDetail,
  hasShipped,
  showsSteps,
} from "@/entities/order/ui/fan-stage-copy";
import { personalIntakeNotice } from "@/entities/parcel/model/size-tier";
import { boxSizeName, fanBoxStateTag, giftBoxName, tierCountText, hasArrived, isMissing, isWaybillEditable, type GiftBox } from "@/entities/parcel/model/box-rows";
import { finderBoxesBelowTodo, giftAddressCode, giftFinderBoxes, needsEarlySendAck } from "@/features/box-waybill/model/box-targets";
import { EarlySendGate } from "@/features/box-waybill/ui/early-send-gate";
import { canCancelGift } from "@/features/gift-cancel/model/cancellable";
import { CancelGiftButton } from "@/features/gift-cancel/ui/cancel-gift-button";
import { ReturnConfirmedNotice } from "@/features/return-address/ui/return-confirmed-notice";
import { approvalDeadlineAt } from "@/entities/order/model/approval-time-left";
import { BoxAddressCode } from "@/features/box-waybill/ui/box-address-code";
import { formatWaybill } from "@/entities/parcel/model/waybill-no";
import { FindMyBox } from "@/features/box-waybill/ui/find-my-box";
import { WaybillEditor } from "@/features/box-waybill/ui/waybill-editor";
import { formatDate, formatDateTime, formatMonthDayKo } from "@/shared/lib/format/datetime";
import { differencesBelowTodo, visibleDifferences, type GiftDifference } from "@/entities/payment/model/difference-rows";
import type { GiftPayment } from "@/entities/payment/model/gift-payment";
import type { FanBoxReply } from "@/entities/gift-reply/api/gift-reply-reads";
import { FanBoxReplies } from "@/features/gift-reply/ui/fan-box-replies";
import { DifferenceSection, type DifferenceNotice } from "./difference-section";
import { PaymentSummary } from "./payment-summary";
import { GiftMemoCard } from "./gift-memo-card";
import { KeepShown } from "./keep-shown";
import type { GiftMemo } from "@/entities/order/model/gift-memo";
import { PROMISE } from "@/shared/config/site-copy";
import s from "./gift-status.module.css";

// 팬 — 선물 하나의 상태. 모양은 섞은 시안 docs/design/mockups/gift-detail-mix-20261118/ (design-rules 47절, 2026-11-18 카드 fankkuk-20261118-1-d2):
//   맨 위 「지금 할 일」 칸 → 하늘 판(대상·종류·상자 수 → 배지 → 안내 제목 → 6칸 단계 줄, 큰 n/6 숫자 없음) →
//   두 단: 왼쪽 주 칸(거절 안내·답장·상자·메모·차액·발송 전 확인) + 오른쪽 --col-aside(승인 → 선물 정보 → 결제). 본문 칸 폭 900 미만이면 한 단.
//   시안은 한 상태의 예시, 칸이 나오는 조건은 아래 그대로(UX 명세 docs/ux/pages/gifts-orderNo.md, UX 정돈 시범 B-1~B-9).
//   송장번호 칸·「받는 주소 없이 보냈다면」은 받는 주소가 보인 뒤에만(먼저 보내기 전에는 「먼저 보내기」 안내만), 맨 아래 「1:1 문의하기」는 늘.
// 문의하지 않아도 지금 어디까지 왔는지 알 수 있게(성공 기준 3).
// 크리에이터에게 보내는 송장번호는 이 화면에 오지 않는다 — toFanView·my_gift_boxes 가 걸러서 넘긴다.
// 받는 주소(inbound-address-code INV-C2·C3): 결제가 끝난 진행 중 주문의 상자마다 「이 선물의 받는 주소」(사무실 주소 + 6자리).
//   6자리는 my_gift_boxes 가 로그인한 주인에게, 유효할 때만 준다 — 없으면 그 상자의 주소 칸을 그리지 않는다. 6자리 빠진 기본 사무실 주소는 그리지 않는다.
// 송장번호는 배송 조회를 보고 싶을 때만 넣는 선택 칸이다(INV-C7). 받는 주소 없이 보낸 상자는 「받는 주소 없이 보냈어요」로 찾는다(INV-C4 ②).
// 크리에이터 승인은 줄 세운 단계가 아니라 출고의 조건이다(INV-S9) — 승인 전이면 판 배지 「OO님 승인 대기」(먼저 보내기 뒤에도 남는다)와
//   진행 줄 「출고」 아래 「승인 필요」, 오른쪽 승인 칸 「OO님의 승인 상태」(승인 대기 · 필요한 때 · 기한 — INV-S6 168시간). 승인되면 「승인됨 · 날짜」.
//   주문번호는 선물 정보의 「주문번호」 줄에만 — 상자 이름은 「상자 N · 크기」.
// 결제 내역은 결제할 때 저장한 금액만 보인다(payment INV-M14, my_gift_payment) — 오른쪽 「결제」 칸.
// 진행 중이고 도착한 상자가 없으면 결제 칸 끝에 「취소하기」(payment INV-M16, 판정은 features/gift-cancel/model/cancellable.ts).

function Check({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 상자 그림(시안 .bt-ico) — 장식 */
function BoxIcon() {
  return (
    <span className={s.boxIco} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
        <path d="M12 22V12" />
        <polyline points="3.29 7 12 12 20.71 7" />
        <path d="m7.5 4.27 9 5.15" />
      </svg>
    </span>
  );
}

const STEP_CLASS = { done: s.done, current: s.next, stopped: s.stopped, todo: undefined } as const;

/** 선물 정보 카드 「상자」 줄 — 「소형 1개 · 중형 1개」. 크기를 모르는 상자가 있으면 개수만 */
function boxSummary(boxes: readonly GiftBox[], boxCount: number): string {
  if (boxes.length === 0 || boxes.some((b) => b.tier === null)) return `${boxCount}개`;
  const count = (t: "small" | "medium" | "large") => boxes.filter((b) => b.tier === t).length;
  return tierCountText({ small: count("small"), medium: count("medium"), large: count("large") });
}

type DifferenceProps = { differences: readonly GiftDifference[]; notice: DifferenceNotice };

export function GiftStatusPage({
  view: readView,
  now,
  deliverySource,
  boxes,
  difference,
  payment = null,
  replies = [],
  photoBase = "",
  memo = null,
  todo = null,
  todoBoxIds = [],
  dueKrw = 0,
  paid = false,
  senderName,
}: {
  view: FanGiftView;
  /** 화면을 그리는 서버의 지금 시각 — 승인 기한이 지났는데 자동 처리 전인 주문을 「기한 지남」으로 보이는 데 쓴다(INV-S6 S6c). 라우트가 넘긴다, 없으면 기한을 보지 않는다 */
  now?: string;
  /** DB 의 단계 설정값(delivery-status INV-DS11) — 라우트가 now 와 함께 넘긴다. 둘 중 하나라도 없으면 배송 단계를 그리지 않는다 */
  deliverySource?: DeliveryStatusSource;
  boxes: readonly GiftBox[];
  difference?: DifferenceProps;
  /** 결제 금액(저장된 값). 없으면 결제 내역을 그리지 않는다. */
  payment?: GiftPayment | null;
  /** 출고된 상자별 받았어요·답장(gift-reply — 보낸 사람 본인 것만, my_gift_replies). 없으면 칸을 그리지 않는다. */
  replies?: readonly FanBoxReply[];
  /** 공개 저장소 주소 — 답장 카드의 크리에이터 사진 */
  photoBase?: string;
  /** 나만 보는 메모(together INV-F7·F8) — my_gift_memo 가 보낸 사람 본인에게만 준다. 없으면 칸을 그리지 않는다. */
  memo?: GiftMemo | null;
  /** 맨 위 「지금 할 일」 칸(action-center INV-J13) — 라우트가 처리할 일 읽기 결과를 이 주문으로 거른 줄로 그려 넘긴다. 줄이 없으면 null(칸 없음). 팬 화면에서만 넘긴다. */
  todo?: ReactNode;
  /** 맨 위 칸의 「도착이 늦어요」에 이미 있는 상자 — 아래 「받는 주소 없이 보냈어요」 고를 목록에서 뺀다(INV-J13). 라우트가 같은 읽기 결과에서 넘긴다 */
  todoBoxIds?: readonly string[];
  /** 오른쪽 요약 상자의 「추가 결제 N원」 꼬리표(시안 v34-part1 .sidebox .tag.warn) — 맨 위 칸의 추가 결제 줄 합(differenceDueKrw). 결제는 맨 위 칸에서만 한다(INV-J13). 0 이면 꼬리표 없음 */
  dueKrw?: number;
  /** 결제를 마치고 돌아온 직후(`?paid=1`) — 상태 판 위 안내 줄(UX 시범 B-1). 라우트가 주소의 물음표 값으로 넘긴다 */
  paid?: boolean;
  /** 크라프트 「택배 접수 작성 예시」 보내는 분 이름에 넣을 내 닉네임(2026-11-17) — 없으면 「팬꾹 닉네임」 자리 표시만 */
  senderName?: string;
}) {
  // 기한이 지났는데 자동 처리 전인 승인 전 주문은 자동 반려와 같게(INV-S6 S6c) — 아래 판정은 모두 이 view 로
  const deadlineView = now ? withApprovalDeadline(readView, now) : readView;
  // 배송 단계(delivery-status INV-DS1·DS2) — 송장 출력·출고 날·크리에이터의 받았어요(답장 스탬프 포함)와 지금 시각으로. 송장번호는 이 계산에도 화면에도 없다(INV-DS3)
  const outboundShippedAt = deadlineView.steps.find((st) => st.key === "shipped" && st.state === "done")?.at ?? null;
  // 택배사 단계(INV-DS4) — webhook 이면 DB 가 주문의 배송 칸(배송 중·배달 완료)에 반영해 둔 값. estimate 에서는 단계 계산이 쓰지 않는다
  const carrier = deadlineView.steps.some((st) => st.key === "delivered" && st.state === "done")
    ? "delivered"
    : deadlineView.steps.some((st) => st.key === "in_transit" && st.state === "done")
      ? "in_transit"
      : null;
  const stage =
    now && deliverySource && deadlineView.outcome === "in_progress"
      ? deliveryStage({ printed: deadlineView.outboundPrinted, shippedAt: outboundShippedAt, confirmed: replies.some((r) => r.received), carrier }, now, deliverySource)
      : null;
  const view = withDeliveryStage(deadlineView, stage);
  const progress = fanProgress(view);
  const currentIdx = view.steps.findIndex((st) => st.state === "current");
  // 상자별 원 송장번호는 입고 전까지만 고친다(design-rules 8-1). 출고 운송장은 읽기 함수가 주지 않는다.
  const inProgress = view.outcome === "in_progress";
  // 팬꾹으로 보내는 단계용 줄(송장번호 입력·주소 없이 보낸 상자 찾기)은 주문의 입고 단계가 끝나기 전까지만 —
  // 입고가 끝났으면 상자 상태가 아직 도착 전으로 남아 있어도 보이지 않는다(지금 할 수 없는 동작은 보이지 않게, design-prompt 6-6)
  const inboundDone = view.steps.some((st) => st.key === "received" && st.state === "done");
  const inboundOpen = inProgress && !inboundDone;
  // 찾기 대상·받는 주소 판정은 features/box-waybill/model/box-targets.ts (INV-C3·C4 ②)
  const finderBoxes = giftFinderBoxes(boxes, inboundOpen);
  // 아래 찾기 구간의 고를 상자 — 칸에 있는 상자는 칸에서만 찾는다(INV-J13)
  const belowFinder = finderBoxesBelowTodo(finderBoxes, todoBoxIds);
  const officeAddress = inProgress ? view.officeAddress : null;
  const earlySendAck = needsEarlySendAck(boxes, inProgress);
  // 찾기 구간 — 받는 주소가 보인 뒤(승인됐거나 먼저 보내기 누름)이고 여기서 고를 입고 전 상자가 있을 때만(UX 시범 B-3).
  // 처음 그림에서 보인 구간은 마지막 상자를 찾은 뒤에도 결과 안내 자리로 남는다(KeepShown)
  const showFinder = !earlySendAck && belowFinder.length > 0;
  // 「먼저 보내기」 전이면 위쪽도 승인 대기로 보인다 — 판정은 fan-stage-copy(view.earlySendPending, INV-S9)
  const badges = fanDetailBadges(view);
  // 승인 전 진행 중 — 출고 아래 「승인 필요」, 선물 정보 카드의 노란 칸(INV-S9)
  const approvalPending = awaitsApproval(view);
  const headline = fanHeadline(view, stage);
  const headlineEstimated = stage !== null && isEstimatedStage(stage);
  const anyAddress = officeAddress !== null && boxes.some((b) => giftAddressCode(b, officeAddress, inProgress) !== null);
  // 차액 줄은 고른 뒤의 길이로 섹션을 그릴지 정한다 — 끝난 주문에 낸 기록이 없으면 빈 섹션을 그리지 않는다.
  // 결제가 필요한 줄은 맨 위 「지금 할 일」 칸에서만 결제한다(INV-J13) — 아래에는 확인 중·완료·닫힘 줄만. 결제창에서 돌아온 안내는 줄이 없어도 보인다
  const shownDifferences = difference ? differencesBelowTodo(visibleDifferences(difference.differences, view.outcome === "in_progress")) : [];
  // 단계 막대와 상자별 상태는 같은 경우(진행 중·돌려보냄)에만 보인다
  const showsProgress = showsSteps(view);
  const cancelable = canCancelGift(boxes, inProgress);
  // 거절·기한 지남 안내(B-6) — 도착한 상자가 있을 때 · 아직 도착하지 않은 상자가 있을 때의 문단만. 첫 문단은 끝난 주문에서 받는 주소가 보였는지 알 수 없어 늘 보인다(BACKLOG)
  const anyArrived = boxes.some((b) => hasArrived(b.state));
  const anyNotYet = boxes.some((b) => isWaybillEditable(b.state));
  const stopNotice = view.outcome === "declined" || view.outcome === "expired";

  // 진행 단계 칸(섞은 시안 design-rules 47절 — mockups/gift-detail-mix-20261118 .steps): 지금 있는 칸(막 끝낸 단계)을 하늘 막대로 강조하고 「현재」,
  // 그다음 칸은 「다음 단계」, 나머지는 날짜. 단계를 다 끝냈으면 마지막 칸이 강조되고 날짜를 그대로 둔다
  const lastDoneAll = view.steps.reduce((acc, st, i) => (st.state === "done" ? i : acc), -1);
  const hereIdx = currentIdx > 0 ? currentIdx - 1 : currentIdx === -1 ? lastDoneAll : -1;
  const stepNote = (st: FanStep, i: number): string | null => {
    if (st.state === "current") return "다음 단계";
    if (i === hereIdx && currentIdx >= 0) return "현재";
    // 출고 날짜만 — 도착 예정일은 판 제목 아래 한 줄로 따로 보인다
    if (st.key === "shipped" && st.state === "done") return st.at ? formatDate(st.at) : null;
    return fanStepDetail(st, view);
  };
  const stepClass = (st: FanStep, i: number): string | undefined => {
    const names = [STEP_CLASS[st.state], st.estimated ? s.estimated : undefined, i === hereIdx ? s.here : undefined].filter(Boolean);
    return names.length > 0 ? names.join(" ") : undefined;
  };
  const boxCard = showsProgress && boxes.length > 0;
  // 상자 칸 모양 — 주소·송장·안내가 붙은 상자가 하나도 없으면 2열 타일, 하나라도 있으면 상자별 묶음(시안 .tiles · .bx)
  const boxHasBody = (b: GiftBox): boolean =>
    isMissing(b.state) || (officeAddress !== null && giftAddressCode(b, officeAddress, inProgress) !== null) || (isWaybillEditable(b.state) && inboundOpen && !b.sendAckNeeded) || Boolean(b.waybillNo);
  const tiles = !boxes.some(boxHasBody);

  // 상자 줄 머리 — 상자 그림 · 「상자 N · 크기」 · 도착 상태(점 + 글자). 타일과 묶음이 같은 머리를 쓴다
  const boxHead = (b: GiftBox, boxName: string) => {
    const size = boxSizeName(b.tier);
    const stateTag = fanBoxStateTag(b.state);
    return (
      <>
        <BoxIcon />
        <h3 className={s.boxName}>
          {boxName}
          {size ? <span> · {size}</span> : null}
        </h3>
        {stateTag ? (
          <span className={statusTagClass(stateTag.tone, "tag--dot")}>{stateTag.text}</span>
        ) : hasArrived(b.state) ? (
          <span className={statusTagClass("success", "tag--dot")}>입고됨</span>
        ) : isMissing(b.state) ? (
          <span className={statusTagClass("warn", "tag--dot")}>미도착</span>
        ) : b.notSentAt ? (
          // 「아직 보내지 않음」을 누른 상자 — 지금 할 일 줄은 없어지고 누른 날만 여기 남는다(UX 시범 C-1, office-workflow INV-W10)
          <span className="tag tag--dot">아직 보내지 않음 · {formatMonthDayKo(b.notSentAt)}</span>
        ) : (
          <span className="tag tag--dot">아직 도착 전</span>
        )}
      </>
    );
  };

  return (
    <main id="main" className={`page-centered v34 ${s.page}`}>
      <div className={s.col}>
        <Link className={s.back} href="/gifts">
          ‹ 보낸 선물로
        </Link>
        {/* 맨 위 「지금 할 일」 칸은 상태 판 위 전체 폭 */}
        <div className={s.top} data-detail-top="">
          {/* 돌려받을 주소 확인 뒤 한 줄(C-3) — 확인하면 그 할 일 줄이 사라져 칸이 없을 수 있으니 칸 밖에 */}
          <ReturnConfirmedNotice className={`okmsg ${s.paidline}`} />
          {todo}
          {/* 결제 직후 안내(B-1) — 다음에 할 일 한 구절: 먼저 보내기 전이면 「먼저 보내기」, 받는 주소가 보이면 그 주소 */}
          {paid ? (
            // 처음 그릴 때부터 있는 글이라 role="status" 를 두지 않는다 — status 는 바뀔 때만 읽힌다(ui-reviewer 2026-10-22 지적 6)
            <p className={s.paidline} data-paid-line="">
              {earlySendAck ? "결제가 완료되었습니다. 승인 전에 팬꾹으로 발송하려면 ‘먼저 보내기’를 눌러 주세요." : anyAddress ? "결제가 완료되었습니다. 아래 팬꾹 주소로 상자를 보내 주세요." : "결제가 완료되었습니다."}
            </p>
          ) : null}
          {/* 맨 위 하늘 판 — 대상·종류·상자 수 → 상태 배지 → 안내(제목) → 6칸 단계 줄(섞은 시안 .hero, design-rules 47절). 등록 날짜는 오른쪽 선물 정보에만 */}
          <section className={s.hero} aria-labelledby="g-title">
            <div className={s.heroTop}>
              <div className={s.heroText}>
                <p className={s.identity}>
                  {view.creatorName}님께 보내는 선물 · {memo?.title ?? view.itemKind} · 상자 {view.boxCount}개
                </p>
                <p className={s.tagrow} data-badges="">
                  {badges.map((b) => (
                    <span key={b.text} className={statusTagClass(b.tone, "tag--dot")}>
                      {b.text}
                    </span>
                  ))}
                </p>
                <h1 className={headlineEstimated ? `${s.title} ${s.estimated}` : s.title} id="g-title" tabIndex={-1} data-delivery-stage={stage ?? undefined}>
                  {headline}
                </h1>
                {view.expectedArrivalDate ? <p className={s.lead}>{formatDate(view.expectedArrivalDate)} 전후 도착 예정</p> : null}
              </div>
              <img className={s.peek} src="/images/home/icon-truck.webp" alt="" aria-hidden="true" width={96} height={96} />
            </div>
            {showsProgress ? (
              <ol className={s.steps} aria-label={`선물 진행 단계 ${progress.total}단계 중 ${progress.done}단계 완료`}>
                {view.steps.map((st, i) => {
                  const note = stepNote(st, i);
                  return (
                    <li key={st.key} className={stepClass(st, i)} aria-current={i === hereIdx ? "step" : undefined}>
                      {FAN_STEP_LABEL[st.key]}
                      {st.state === "done" ? <span className="sr-only"> 완료</span> : null}
                      {st.state === "stopped" ? <span className="sr-only"> 멈춤</span> : null}
                      {st.key === "shipped" && approvalPending ? (
                        <span className={s.apv} data-approval-needed="">
                          <span className={statusTagClass("warn", "tag--dot")}>승인 필요</span>
                        </span>
                      ) : null}
                      {note ? <small>{note}</small> : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </section>
        </div>

        {/* 두 단 — 왼쪽 주 칸(상자·답장·안내) + 오른쪽 --col-aside(승인 → 선물 정보 → 결제). 본문 칸 폭 900 이상에서만 두 단, 그 아래는 오른쪽이 아래로(시안 .layout) */}
        <div className={s.layout}>
          <div className={s.main}>
            {view.outcome === "returned" ? (
              <section className={`${s.dcard} ${s.sec}`} data-sec="">
                <h2 className={s.secTitle}>반송 완료</h2>
                {/* 문구 3 다듬은본. 접수 한도 초과는 반송이 아니라 개인접수(payment INV-M23) — 차액을 7일 안에 내지 않았을 때 반송된다 */}
                <p className={s.desc}>
                  추적 장치 등 금지 물품이 발견되면 반송됩니다.
                  <br />
                  이 경우 검수비와 반송 배송비가 차감되어 환불 금액이 없습니다.
                  <br />
                  {personalIntakeNotice(DIFFERENCE_DEADLINE_DAYS)}
                </p>
              </section>
            ) : null}

            {/* 거절·기한 지남 — 「이 선물은 발송하지 마세요」 흰 카드 + 「!」 원(design-rules 38·47절) */}
            {stopNotice ? (
              <section className={`${s.dcard} ${s.warnbox}`} data-sec="" aria-labelledby="stop-title">
                <div className={s.warnHead}>
                  <span className={s.warnMark} aria-hidden="true">
                    !
                  </span>
                  <h2 className={s.secTitle} id="stop-title">
                    이 선물은 발송하지 마세요
                  </h2>
                </div>
                {/* 거절·자동 반려 모두 같은 안내 — 거절인지 기간 지남인지는 위 한 줄이 말한다(decline-block INV-D5). 상자마다 돌려준다(payment INV-M8·M18, 2026-10-10 늦게 오는 상자) */}
                <p className={s.desc}>팬꾹 주소가 표시되기 전에 취소·거절·기한 만료로 종료된 경우 전액 환불됩니다.</p>
                {anyArrived || anyNotYet ? (
                  <ul className={s.stopList}>
                    {anyArrived ? <li>도착한 상자는 확인한 반송 주소로 배송됩니다. 해당 상자 금액에서 반송 배송비를 차감해 환불합니다.</li> : null}
                    {anyNotYet ? (
                      <li>
                        미도착 상자는 반송 배송비를 제외한 금액을 먼저 환불합니다. 이미 발송한 상자는 도착 후 반송됩니다.
                        <br />
                        결제 완료 후 30일 이내에 도착하지 않으면 남은 배송비도 환불합니다.
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {/* 받았어요·답장(gift-reply INV-G6·G8·G9) — 출고된 상자가 있을 때만. 날짜만, 시각은 없다. 상자 칸보다 위(시안 상태 5·6) */}
            {replies.length > 0 ? (
              <section className={`${s.dcard} ${s.sec}`} data-sec="" aria-labelledby="reply-title">
                <h2 className={s.secTitle} id="reply-title">
                  수령 확인·답장
                </h2>
                <p className={s.desc}>크리에이터의 수령 확인일과 답장을 볼 수 있습니다. 답장의 공개 여부를 선택하거나 이미지 카드로 공유해 주세요.</p>
                <div className={s.inner}>
                  <FanBoxReplies rows={replies} photoBase={photoBase} />
                </div>
              </section>
            ) : null}

            {boxCard ? (
              <section className={s.dcard} aria-labelledby="box-status-title">
                {/* 「먼저 보내기」를 누르면 안내 칸이 사라진다 — 포커스는 그대로 남는 이 제목으로 옮긴다 */}
                <h2 className={s.cardTitle} id="box-status-title" tabIndex={-1}>
                  상자 {boxes.length}개
                </h2>
                {earlySendAck ? <EarlySendGate orderNo={view.orderNo} creatorName={view.creatorName} focusAfterId="box-status-title" /> : null}
                {anyAddress ? (
                  <p className={s.note}>
                    상자별 팬꾹 주소가 다릅니다. 해당 상자의 주소를 끝 6자리까지 빠짐없이 입력해 주세요.
                    <br />
                    승인 전에도 팬꾹으로 보낼 수 있지만, 크리에이터에게 배송하려면 결제 후 7일 이내 승인이 필요합니다.
                  </p>
                ) : null}
                {tiles ? (
                  // 주소·송장·안내가 붙은 상자가 없으면 2열 타일(시안 .tiles). 상자 번호는 목록 순서(giftBoxName)
                  <ul className={s.tiles}>
                    {boxes.map((b, i) => (
                      <li key={b.boxId} className={s.tile}>
                        {boxHead(b, giftBoxName(i))}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={s.bxs}>
                    {boxes.map((b, i) => {
                      // 상자 번호 — 목록 순서로 센다(giftBoxName). 「팬꾹 주소 없이 보냈다면」 고르는 칸도 같은 번호(giftFinderBoxes)
                      const boxName = giftBoxName(i);
                      const addressCode = giftAddressCode(b, officeAddress, inProgress);
                      return (
                        <div key={b.boxId} className={s.bx}>
                          <div className={s.bxh}>{boxHead(b, boxName)}</div>
                          {isMissing(b.state) ? (
                            <p className="hint">
                              결제 완료 후 30일이 지나도록 도착하지 않아 이 상자의 접수가 종료되었습니다. 해당 상자 금액은 환불됩니다.
                              <br />
                              더 이상 발송하지 마세요. 이후 도착하는 상자는 반송됩니다.
                            </p>
                          ) : null}
                          {officeAddress && addressCode ? (
                            <BoxAddressCode officeAddress={officeAddress} code={addressCode} boxName={boxName} senderName={senderName} />
                          ) : null}
                          {isWaybillEditable(b.state) && inboundOpen && !b.sendAckNeeded ? (
                            // 송장번호 입력은 접어 둔다 — 배송 조회를 보고 싶을 때만 넣는 선택 칸(INV-C7).
                            // 그 상자에 받는 주소가 보인 뒤에만 — 먼저 보내기 전에는 보낼 주소가 없다(UX 시범 B-2)
                            <details className={s.fold}>
                              <summary>팬꾹으로 보낸 송장번호 (선택)</summary>
                              <div className={s.in}>
                                <WaybillEditor
                                  target={{ kind: "box", id: b.boxId }}
                                  boxName={boxName}
                                  initial={b.waybillNo}
                                  layout="box"
                                  hint="송장번호를 등록하면 팬꾹까지의 배송 현황을 조회할 수 있습니다."
                                />
                              </div>
                            </details>
                          ) : b.waybillNo ? (
                            <>
                              <dl className={`${s.kv} ${s["inv-fixed"]}`}>
                                <div>
                                  <dt>송장번호</dt>
                                  <dd className={s.no}>{formatWaybill(b.waybillNo)}</dd>
                                </div>
                              </dl>
                              {hasArrived(b.state) ? <p className="hint">입고 후에는 송장번호를 수정할 수 없습니다.</p> : null}
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* 받는 주소 없이 보냈다면(inbound-address-code INV-C4 ②) — 진행 중이고 입고 단계 전 + 받 주소가 보인 뒤 + 고를 입고 전 상자가 있을 때(접어 둔다, B-3).
                    마지막 상자를 찾아 고를 상자가 없어져도 결과 안내가 남아 있게, 빈 목록은 칸 안에서 처리한다. 잇는 판정은 DB 가 한다 */}
                {inboundOpen ? (
                  <KeepShown key={view.orderNo} show={showFinder}>
                    <details className={s.fold} data-sec="" data-finder="">
                      <summary>주소 끝 6자리 없이 보낸 상자 찾기</summary>
                      <div className={s.in}>
                        <p className="hint">팬꾹 주소 끝 6자리를 누락했다면 송장번호와 택배사로 도착한 상자를 찾아 주세요.</p>
                        <FindMyBox boxes={belowFinder} />
                        <p className="hint">입력 오류 허용 횟수: 하루 최대 5회</p>
                      </div>
                    </details>
                  </KeepShown>
                ) : null}
              </section>
            ) : null}

            {memo ? <GiftMemoCard memo={memo} /> : null}

            {/* 차액 결제 기록(payment INV-M11·M12·M13) — 결제 버튼은 맨 위 칸에만(INV-J13). 진행 중이 아니면 낸 기록만 남는다 */}
            {difference && (shownDifferences.length > 0 || difference.notice) ? <DifferenceSection differences={shownDifferences} notice={difference.notice} /> : null}

            {/* 결제가 끝난 진행 중 주문 — 상자를 더 보내는 길은 없다(스펙 비범위: 상자 추가). 도착한 뒤에는 더 보낼 일이 없어 접는다. 하늘 안내 면(시안 .sheet) */}
            {anyAddress && view.canEnterTrackingNo ? (
              <section className={s.sheet} data-sec="" aria-labelledby="pre-title">
                <h2 className={s.secTitle} id="pre-title">
                  발송 전 확인 사항
                </h2>
                <p className={s.desc}>추가 상자는 새로 등록해 주세요. 팬꾹 주소는 상자마다 다릅니다.</p>
                {/* 거절·7일 반송 안내는 승인 전에만(B-5) — 이미 승인된 선물에는 해당하지 않는다 */}
                {approvalPending ? (
                  <ul className={s.sheetList} data-reject-notice="">
                    <li>크리에이터가 거절하거나 결제 후 7일 이내에 승인하지 않으면 선물 전달이 취소됩니다.</li>
                    <li>도착한 상자: 확인한 반송 주소로 반송 · 반송 배송비 차감 후 환불</li>
                    <li>미도착 상자: 반송 배송비 차감 후 먼저 환불 · 결제 완료 후 30일 이내 미도착 시 남은 배송비도 환불</li>
                  </ul>
                ) : null}
              </section>
            ) : null}
          </div>

          {/* 오른쪽 칸 — 카드 없이 선으로 나눈 칸 셋: 승인(진행 중에만) → 선물 정보 → 결제(시안 .side, design-rules 47절 — 33절의 「선물 정보 카드 하나」를 대신한다) */}
          <aside className={s.side} aria-label="선물 요약" data-detail-side="">
            {/* 승인 전 — 노란 칸(대기 면). 승인은 출고 전에만 있으면 된다(INV-S9), 기한은 결제 완료부터 168시간(INV-S6) */}
            {approvalPending ? (
              <section className={s.sideBlock} aria-labelledby="approval-title" data-approval-box="">
                <h2 className={s.sideTitle} id="approval-title">
                  {view.creatorName}님의 승인 상태
                </h2>
                <div className={s.approval}>
                  <strong>승인 대기</strong>
                  <p>필요한 때 · 출고 전</p>
                </div>
                <dl className={s.kv}>
                  <div>
                    <dt>기한</dt>
                    <dd>{formatDate(approvalDeadlineAt(view.registeredAt))}까지</dd>
                  </div>
                </dl>
              </section>
            ) : view.outcome === "in_progress" ? (
              // 승인된 진행 중 선물 — 초록 면 한 줄
              <section className={s.sideBlock} aria-labelledby="approval-title" data-approval-done="">
                <h2 className={s.sideTitle} id="approval-title">
                  {APPROVAL_LABEL}
                </h2>
                <div className={`${s.approval} ${s.approvalOk}`}>
                  <strong>승인됨</strong>
                  {view.approval.at ? <p>{formatDate(view.approval.at)}</p> : null}
                </div>
              </section>
            ) : null}
            <section className={s.sideBlock} aria-labelledby="info-title">
              <h2 className={s.sideTitle} id="info-title">
                선물 정보
              </h2>
              <dl className={s.kv}>
                <div>
                  <dt>받는 크리에이터</dt>
                  <dd>{view.creatorName}님</dd>
                </div>
                <div>
                  <dt>선물</dt>
                  <dd>{memo?.title ?? view.itemKind}</dd>
                </div>
                <div>
                  <dt>상자</dt>
                  <dd>{boxSummary(boxes, view.boxCount)}</dd>
                </div>
                <div>
                  <dt>주문번호</dt>
                  <dd className={s.plain}>{view.orderNo}</dd>
                </div>
                <div>
                  <dt>등록</dt>
                  <dd className={s.plain}>{formatDateTime(view.registeredAt)}</dd>
                </div>
              </dl>
              {hasShipped(view) ? <p className={s.note}>{PROMISE.addressFan} 크리에이터행 송장번호도 공개하지 않습니다.</p> : null}
              {payment ? null : (
                <p className={s.chips}>
                  <span className="tag">
                    <Check size={16} />
                    검수 포함
                  </span>
                </p>
              )}
              {!payment && cancelable ? (
                <div className={s.cancel}>
                  <CancelGiftButton orderNo={view.orderNo} addressShown={!view.earlySendPending} />
                </div>
              ) : null}
            </section>
            {payment ? (
              <section className={`${s.sideBlock} ${s.pay}`} aria-labelledby="pay-title">
                <h2 className={s.sideTitle} id="pay-title">
                  결제
                </h2>
                <PaymentSummary payment={payment} differences={difference?.differences ?? []} dueKrw={dueKrw} inProgress={inProgress} />
                {cancelable ? (
                  <div className={s.cancel}>
                    <CancelGiftButton orderNo={view.orderNo} addressShown={!view.earlySendPending} />
                  </div>
                ) : null}
              </section>
            ) : null}
          </aside>
        </div>

        {/* 문제를 알릴 입구(B-7) — 모든 상태에서 맨 아래 같은 자리. 잘못 이어진 상자 등은 1:1 문의로 처리한다 */}
        <p className={s.bottomlink}>
          <Link className={s.textlink} href="/support">
            1:1 문의하기
          </Link>
        </p>
      </div>
    </main>
  );
}
