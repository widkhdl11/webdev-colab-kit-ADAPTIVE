import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { ReactNode } from "react";
import { withApprovalDeadline, type FanGiftView, type FanStep } from "@/entities/order/model/fan-view";
import {
  APPROVAL_LABEL,
  awaitsApproval,
  FAN_STEP_LABEL,
  fanDetailBadges,
  fanHeadline,
  fanProgress,
  fanStepDetail,
  hasShipped,
  RETURN_ON_REJECT_NOTICE,
  showsSteps,
} from "@/entities/order/ui/fan-stage-copy";
import { boxSizeName, fanBoxStateTag, giftBoxName, tierCountText, hasArrived, isMissing, isWaybillEditable, type GiftBox } from "@/entities/parcel/model/box-rows";
import { finderBoxesBelowTodo, giftAddressCode, giftFinderBoxes, needsEarlySendAck } from "@/features/box-waybill/model/box-targets";
import { EarlySendGate } from "@/features/box-waybill/ui/early-send-gate";
import { canCancelGift } from "@/features/gift-cancel/model/cancellable";
import { CancelGiftButton } from "@/features/gift-cancel/ui/cancel-gift-button";
import { ReturnConfirmedNotice } from "@/features/return-address/ui/return-confirmed-notice";
import { RETURN_ON_INSPECTION_NOTICE } from "@/entities/parcel/model/size-tier";
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

// 팬 — 선물 하나의 상태. 시안: docs/design/mockups/site/v35-part1/gift-detail.html (design-rules 22절 — 맨 위 「지금 할 일」 칸 → 하늘 상태 판 → 상자·결제·주문 정보 카드). 시안은 한 상태의 예시, 칸이 나오는 조건은 아래 그대로
// 배치·보이는 조건은 UX 정돈 시범(2026-10-22 승인, docs/ux/diagnosis-2026-10-22-pilot.md B-1~B-9, 시안 ux-pilot-2026-10-22/gift-detail.html):
//   상자 칸 8 + 오른쪽 한 열(결제 위·주문 정보 아래), 999 이하 상자 칸 아래 둘 나란히, 767 이하 한 줄씩.
//   송장번호 칸·「받는 주소 없이 보냈다면」은 받는 주소가 보인 뒤에만(먼저 보내기 전에는 「먼저 보내기」 안내만), 맨 아래 「1:1 문의하기」는 늘.
// 문의하지 않아도 지금 어디까지 왔는지 알 수 있게(성공 기준 3).
// 크리에이터에게 보내는 송장번호는 이 화면에 오지 않는다 — toFanView·my_gift_boxes 가 걸러서 넘긴다.
// 메모·답장·차액 기록·안내는 카드 셋 아래 테두리 없는 구간들(위 1px 선). 헤더·푸터는 라우트가 붙인다.
// 받는 주소(inbound-address-code INV-C2·C3): 결제가 끝난 진행 중 주문의 상자마다 「이 선물의 받는 주소」(사무실 주소 + 6자리).
//   6자리는 my_gift_boxes 가 로그인한 주인에게, 유효할 때만 준다 — 없으면 그 상자의 주소 칸을 그리지 않는다. 6자리 빠진 기본 사무실 주소는 그리지 않는다.
// 송장번호는 배송 조회를 보고 싶을 때만 넣는 선택 칸이다(INV-C7). 받는 주소 없이 보낸 상자는 「받는 주소 없이 보냈어요」로 찾는다(INV-C4 ②).
// v41(2026-10-26 d136, design-rules 33절 · UX 명세 docs/ux/pages/gifts-orderNo.md, 시안 v41-user-fixes/s/detail-after.html):
//   크리에이터 승인은 줄 세운 단계가 아니라 출고의 조건이다(INV-S9) — 승인 전이면 상태 판 배지 「OO님 승인 대기」(먼저 보내기 뒤에도 남는다)와
//   진행 줄 「출고」 아래 「승인 필요」, 오른쪽 「선물 정보」 카드 안 노란 칸 「OO님의 승인 상태」(지금 · 필요한 때 · 기한 — INV-S6 168시간). 승인되면 「승인됨 · 날짜」 한 줄.
//   결제·주문 정보 두 카드는 「선물 정보」 카드 하나로 합쳤다. 주문번호는 그 카드의 「주문번호」 줄에만 — 상자 이름은 「상자 N · 크기」.
// 결제 내역은 결제할 때 저장한 금액만 보인다(payment INV-M14, my_gift_payment) — 선물 정보 카드 안 「결제」 묶음.
// 진행 중이고 도착한 상자가 없으면 선물 정보 카드 끝에 「취소하기」(payment INV-M16, 판정은 features/gift-cancel/model/cancellable.ts).

function Check({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
}: {
  view: FanGiftView;
  /** 화면을 그리는 서버의 지금 시각 — 승인 기한이 지났는데 자동 처리 전인 주문을 「기한 지남」으로 보이는 데 쓴다(INV-S6 S6c). 라우트가 넘긴다, 없으면 기한을 보지 않는다 */
  now?: string;
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
}) {
  // 기한이 지났는데 자동 처리 전인 승인 전 주문은 자동 반려와 같게(INV-S6 S6c) — 아래 판정은 모두 이 view 로
  const view = now ? withApprovalDeadline(readView, now) : readView;
  const progress = fanProgress(view);
  // 배지의 「N/6」은 지금 있는 단계 번호다 — 끝낸 단계 수(4)를 쓰면 아래 진행 줄의 현재 단계(5번 배송중)와 숫자가 어긋났다(2026-10-09 디자인 점검)
  const currentIdx = view.steps.findIndex((st) => st.state === "current");
  const stepNo = currentIdx >= 0 ? currentIdx + 1 : progress.done;
  // 상자별 원 송장번호는 입고 전까지만 고친다(design-rules 8-1). 출고 운송장은 읽기 함수가 주지 않는다.
  const inProgress = view.outcome === "in_progress";
  // 찾기 대상·받는 주소 판정은 features/box-waybill/model/box-targets.ts (INV-C3·C4 ②)
  const finderBoxes = giftFinderBoxes(boxes, inProgress);
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
  const headline = fanHeadline(view);
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

  // 진행 단계 칸 아래 작은 글 — 지금 막 끝낸 단계는 「지금」, 다음 단계는 「다음 단계」, 나머지는 날짜(시안 v35 .dsteps)
  const lastDoneIdx = currentIdx > 0 ? currentIdx - 1 : -1;
  const stepNote = (st: FanStep, i: number): string | null => {
    if (st.state === "current") return "다음 단계";
    if (i === lastDoneIdx) return "지금";
    // 출고 날짜만 — 도착 예정일은 위 큰 글자로 따로 보인다
    if (st.key === "shipped" && st.state === "done") return st.at ? formatDate(st.at) : null;
    return fanStepDetail(st, view);
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
              {earlySendAck ? "결제가 끝났어요. 먼저 보내려면 아래 「먼저 보내기」를 눌러 주세요." : anyAddress ? "결제가 끝났어요. 아래 팬꾹 주소로 상자를 보내 주세요." : "결제가 끝났어요."}
            </p>
          ) : null}
          {/* 맨 위 하늘 판 — 지금 상태 · 도착 예정일 · 6단계 진행(시안 v35-part1/gift-detail.html .dhero, design-rules 22절) */}
          <section className={s.dhero} aria-labelledby="g-title">
            <img className={s.peek} src="/images/home/icon-truck.webp" alt="" aria-hidden="true" width={96} height={96} />
            <p className={s.meta}>
              등록 {formatDate(view.registeredAt)}
            </p>
            <h1 className={s.title} id="g-title" tabIndex={-1}>
              {view.creatorName}님께 보내는 선물
            </h1>
            <p className={s.what}>
              {memo?.title ?? view.itemKind} · 상자 {view.boxCount}개
            </p>
            <div className={s.now}>
              <div className={s.when}>
                <p className={s.tagrow} data-badges="">
                  {badges.map((b) => (
                    <span key={b.text} className={statusTagClass(b.tone)}>
                      {b.text}
                    </span>
                  ))}
                </p>
                {view.expectedArrivalDate ? (
                  <p className={`num-big ${s.big}`}>
                    {formatDate(view.expectedArrivalDate)}
                    <small>전후 도착 예정</small>
                  </p>
                ) : view.outcome === "in_progress" ? (
                  <p className={`num-big ${s.big}`}>
                    {stepNo}/{progress.total}
                  </p>
                ) : null}
              </div>
              <p className={s.msg}>{headline}</p>
            </div>
            {showsProgress ? (
              <ol className={s.steps} aria-label={`선물 진행 단계 ${progress.total}단계 중 ${progress.done}단계 완료`}>
                {view.steps.map((st, i) => {
                  const note = stepNote(st, i);
                  return (
                    <li key={st.key} className={STEP_CLASS[st.state]} aria-current={st.state === "current" ? "step" : undefined}>
                      {FAN_STEP_LABEL[st.key]}
                      {st.state === "done" ? <span className="sr-only"> 완료</span> : null}
                      {st.state === "stopped" ? <span className="sr-only"> 멈춤</span> : null}
                      {st.key === "shipped" && approvalPending ? (
                        <span className={s.apv} data-approval-needed="">
                          <span className={statusTagClass("warn")}>승인 필요</span>
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

        {view.outcome === "returned" ? (
          <div className={s.sec} data-sec="">
            <h2 className={s.secTitle}>돌려보내 드렸어요</h2>
            <p className={s.desc}>{RETURN_ON_INSPECTION_NOTICE}</p>
          </div>
        ) : null}
        {view.outcome === "declined" || view.outcome === "expired" ? (
          <div className={s.sec} data-sec="">
            <h2 className={s.secTitle}>이 선물은 보내지 마세요</h2>
            {/* 거절·자동 반려 모두 같은 안내 — 거절인지 기간 지남인지는 위 한 줄이 말한다(decline-block INV-D5). 상자마다 돌려준다(payment INV-M8·M18, 2026-10-10 늦게 오는 상자) */}
            <p className={s.desc}>팬꾹 주소가 보이기 전에 끝났다면 결제 금액을 모두 돌려드려요.</p>
            {anyArrived ? <p className={s.more}>사무실에 도착한 상자는 보낸 주소로 돌려보내 드리고, 그 상자의 반송 택배비를 뺀 금액을 돌려드려요.</p> : null}
            {anyNotYet ? (
              <p className={s.more}>
                아직 도착하지 않은 상자는 택배비를 뺀 금액을 먼저 돌려드려요. 이미 보내셨다면 도착하는 대로 돌려보내 드리고, 7일 안에 도착하지 않으면
                택배비도 돌려드려요.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 상자 칸 8 + 오른쪽 한 열(결제 위 · 주문 정보 아래 — 시안 ux-pilot .dgrid.split·.dside). 주문 정보는 덜 중요한 회색 카드.
            상자 칸이 없는 주문(끝남·상자 없음)은 오른쪽 열만 — 「선물 정보」 카드 하나가 PC 반 폭(오른쪽 반은 비움, design-rules 33절) */}
        <div className={showsProgress && boxes.length > 0 ? `${s.dgrid} ${s.split}` : s.dgrid}>
          {showsProgress && boxes.length > 0 ? (
            <section className={s.dcard} aria-labelledby="box-status-title">
              {/* 「먼저 보내기」를 누르면 안내 칸이 사라진다 — 포커스는 그대로 남는 이 제목으로 옮긴다 */}
              <h2 className={s.cardTitle} id="box-status-title" tabIndex={-1}>
                상자 {boxes.length}개
              </h2>
              {earlySendAck ? <EarlySendGate orderNo={view.orderNo} creatorName={view.creatorName} focusAfterId="box-status-title" /> : null}
              {anyAddress ? (
                <p className={s.note}>상자마다 팬꾹 주소가 달라요.</p>
              ) : null}
              <div className={s.boxes}>
                {boxes.map((b, i) => {
                  // 상자 번호 — 목록 순서로 센다(giftBoxName). 「팬꾹 주소 없이 보냈다면」 고르는 칸도 같은 번호(giftFinderBoxes)
                  const boxName = giftBoxName(i);
                  const size = boxSizeName(b.tier);
                  const addressCode = giftAddressCode(b, officeAddress, inProgress);
                  const stateTag = fanBoxStateTag(b.state);
                  return (
                    <div key={b.boxId} className={s.box}>
                      <div className={s.boxline}>
                        <h3 className={s.boxName}>
                          {boxName}
                          {size ? <span> · {size}</span> : null}
                        </h3>
                        {stateTag ? (
                          <span className={statusTagClass(stateTag.tone)}>{stateTag.text}</span>
                        ) : hasArrived(b.state) ? (
                          <span className={statusTagClass("success")}>
                            <Check size={16} />
                            입고됨
                          </span>
                        ) : isMissing(b.state) ? (
                          <span className={statusTagClass("warn")}>도착하지 않음</span>
                        ) : b.notSentAt ? (
                          // 「아직 보내지 않음」을 누른 상자 — 지금 할 일 줄은 없어지고 누른 날만 여기 남는다(UX 시범 C-1, office-workflow INV-W10)
                          <span className="tag">아직 보내지 않음 · {formatMonthDayKo(b.notSentAt)}</span>
                        ) : (
                          <span className="tag">아직 도착 전</span>
                        )}
                      </div>
                      {isMissing(b.state) ? (
                        <p className="hint">결제하고 30일이 지나도 도착하지 않아 이 상자는 닫혔어요. 이 상자 금액을 돌려드려요. 이제 이 상자를 보내도 받지 않고 돌려보내요.</p>
                      ) : null}
                      {officeAddress && addressCode ? (
                        <BoxAddressCode officeAddress={officeAddress} code={addressCode} boxName={boxName} />
                      ) : null}
                      {isWaybillEditable(b.state) && inProgress && !b.sendAckNeeded ? (
                        // 송장번호 입력은 접어 둔다(시안 v35 .fold) — 배송 조회를 보고 싶을 때만 넣는 선택 칸(INV-C7).
                        // 그 상자에 받는 주소가 보인 뒤에만 — 먼저 보내기 전에는 보낼 주소가 없다(UX 시범 B-2)
                        <details className={s.fold}>
                          <summary>이 상자를 보낸 택배 송장번호</summary>
                          <div className={s.in}>
                            <WaybillEditor
                              target={{ kind: "box", id: b.boxId }}
                              boxName={boxName}
                              initial={b.waybillNo}
                              layout="box"
                              hint="선택이에요. 넣으면 배송 조회로 팬꾹까지 오는 길을 보여 드려요."
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
                          {hasArrived(b.state) ? <p className="hint">입고된 상자는 송장번호를 고칠 수 없어요.</p> : null}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {/* 받는 주소 없이 보냈다면(inbound-address-code INV-C4 ②) — 진행 중 + 받는 주소가 보인 뒤 + 고를 입고 전 상자가 있을 때(접어 둔다, B-3).
                  마지막 상자를 찾아 고를 상자가 없어져도 결과 안내가 남아 있게, 빈 목록은 칸 안에서 처리한다. 잇는 판정은 DB 가 한다 */}
              {inProgress ? (
                <KeepShown key={view.orderNo} show={showFinder}>
                  <details className={s.fold} data-sec="" data-finder="">
                    <summary>팬꾹 주소 없이 보냈다면</summary>
                    <div className={s.in}>
                      <p className="hint">팬꾹 주소 끝 6자리를 빼고 보낸 상자는 사무실에서 바로 찾지 못해요. 송장번호와 택배사가 맞으면 찾아요.</p>
                      <FindMyBox boxes={belowFinder} />
                      <p className="hint">틀린 입력은 하루에 다섯 번까지예요.</p>
                    </div>
                  </details>
                </KeepShown>
              ) : null}
            </section>
          ) : null}

          <div className={s.dside} data-detail-side="">
            {/* 선물 정보 — 결제·주문 정보를 합친 카드 하나(design-rules 33절, 22절에서 벗어남). 모든 상태에 같은 카드, 승인 칸은 진행 중에만 */}
            <section className={`${s.dcard} ${s.ginfo}`} aria-labelledby="info-title">
              <h2 className={s.cardTitle} id="info-title">
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
                {/* 승인된 진행 중 선물 — 노란 칸 대신 한 줄 */}
                {view.outcome === "in_progress" && !approvalPending ? (
                  <div data-approval-done="">
                    <dt>{APPROVAL_LABEL}</dt>
                    <dd>{view.approval.at ? `승인됨 · ${formatDate(view.approval.at)}` : "승인됨"}</dd>
                  </div>
                ) : null}
              </dl>
              {/* 승인 전 — 노란 칸(대기 면). 승인은 출고 전에만 있으면 된다(INV-S9), 기한은 결제 완료부터 168시간(INV-S6) */}
              {approvalPending ? (
                <div className={`${s.grp} ${s.apvGrp}`} role="group" aria-labelledby="approval-title" data-approval-box="">
                  <h3 className={s.grpTitle} id="approval-title">
                    {view.creatorName}님의 승인 상태
                  </h3>
                  <dl className={s.kv}>
                    <div>
                      <dt>지금</dt>
                      <dd>
                        <span className={statusTagClass("warn")}>승인 대기</span>
                      </dd>
                    </div>
                    <div>
                      <dt>필요한 때</dt>
                      <dd>출고 전</dd>
                    </div>
                    <div>
                      <dt>기한</dt>
                      <dd>{formatDate(approvalDeadlineAt(view.registeredAt))}까지</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
              {payment ? (
                <div className={s.grp} role="group" aria-labelledby="pay-title">
                  <h3 className={s.grpTitle} id="pay-title">
                    결제
                  </h3>
                  <PaymentSummary payment={payment} differences={difference?.differences ?? []} dueKrw={dueKrw} inProgress={inProgress} />
                </div>
              ) : (
                <p className={s["tag-line"]}>
                  <span className="tag">
                    <Check size={16} />
                    검수 포함
                  </span>
                </p>
              )}
              {hasShipped(view) ? <p className={s.note}>{PROMISE.addressFan} 그래서 크리에이터에게 가는 송장번호도 알려 드리지 않아요.</p> : null}
              {cancelable ? (
                <div className={s.cancel}>
                  <CancelGiftButton orderNo={view.orderNo} addressShown={!view.earlySendPending} />
                </div>
              ) : null}
            </section>
          </div>
        </div>

        {memo ? <GiftMemoCard memo={memo} /> : null}

        {/* 받았어요·답장(gift-reply INV-G6·G8·G9) — 출고된 상자가 있을 때만. 날짜만, 시각은 없다 */}
        {replies.length > 0 ? (
          <section className={s.sec} data-sec="" aria-labelledby="reply-title">
            <h2 className={s.secTitle} id="reply-title">
              받았어요 · 답장
            </h2>
            <p className={s.desc}>크리에이터가 상자를 받았다고 남기면 날짜가 보여요. 답장이 오면 공개할지 정하고 카드로 공유할 수 있어요.</p>
            <div className={s.inner}>
              <FanBoxReplies rows={replies} photoBase={photoBase} returnPath={`/gifts/${view.orderNo}`} />
            </div>
          </section>
        ) : null}
        {/* 차액 결제 기록(payment INV-M11·M12·M13) — 결제 버튼은 맨 위 칸에만(INV-J13). 진행 중이 아니면 낸 기록만 남는다 */}
        {difference && (shownDifferences.length > 0 || difference.notice) ? <DifferenceSection differences={shownDifferences} notice={difference.notice} /> : null}

        {/* 결제가 끝난 진행 중 주문 — 상자를 더 보내는 길은 없다(스펙 비범위: 상자 추가). 도착한 뒤에는 더 보낼 일이 없어 접는다 */}
        {anyAddress && view.canEnterTrackingNo ? (
          <div className={s.sec} data-sec="">
            <h2 className={s.secTitle}>보내기 전에 알아 두세요</h2>
            <p className={s.desc}>상자를 더 보내려면 새로 등록해 주세요. 상자마다 팬꾹 주소가 달라요.</p>
            {/* 거절·7일 반송 안내는 승인 전에만(B-5) — 이미 승인된 선물에는 해당하지 않는다 */}
            {approvalPending ? <p className={s.more}>{RETURN_ON_REJECT_NOTICE}</p> : null}
          </div>
        ) : null}

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
