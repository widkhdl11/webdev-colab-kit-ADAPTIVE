import { statusTagClass, type StatusTone } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import {
  APPROVAL_LABEL,
  FAN_STEP_LABEL,
  fanBadge,
  fanHeadline,
  fanProgress,
  fanStepDetail,
  hasShipped,
  RETURN_ON_REJECT_NOTICE,
  showsSteps,
} from "@/entities/order/ui/fan-stage-copy";
import { boxTierName, fanBoxStateTag, hasArrived, isMissing, isWaybillEditable, type GiftBox } from "@/entities/parcel/model/box-rows";
import { finderBoxesBelowTodo, giftAddressCode, giftFinderBoxes, needsEarlySendAck } from "@/features/box-waybill/model/box-targets";
import { EarlySendGate } from "@/features/box-waybill/ui/early-send-gate";
import { canCancelGift } from "@/features/gift-cancel/model/cancellable";
import { CancelGiftButton } from "@/features/gift-cancel/ui/cancel-gift-button";
import { RETURN_ON_INSPECTION_NOTICE } from "@/entities/parcel/model/size-tier";
import { formatWaybill } from "@/entities/parcel/model/waybill-no";
import { FindMyBox } from "@/features/box-waybill/ui/find-my-box";
import { ReceivingAddress } from "@/features/box-waybill/ui/receiving-address";
import { WaybillEditor } from "@/features/box-waybill/ui/waybill-editor";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
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

// 팬 — 선물 하나의 상태. 시안: docs/design/mockups/site/v34-part1/gift-detail.html (design-rules 21절 — 맨 위 「지금 할 일」 칸 → 두 단: 본문 + 오른쪽 288 요약 상자, 999 이하 한 단). 시안은 한 상태의 예시, 칸이 나오는 조건은 아래 그대로
// 문의하지 않아도 지금 어디까지 왔는지 알 수 있게(성공 기준 3).
// 크리에이터에게 보내는 송장번호는 이 화면에 오지 않는다 — toFanView·my_gift_boxes 가 걸러서 넘긴다.
// 본문 = 진행 카드(흰 판 하나) 아래 테두리 없는 구간들(위 1px 선). 헤더·푸터는 라우트가 붙인다.
// 받는 주소(inbound-address-code INV-C2·C3): 결제가 끝난 진행 중 주문의 상자마다 「이 선물의 받는 주소」(사무실 주소 + 6자리).
//   6자리는 my_gift_boxes 가 로그인한 주인에게, 유효할 때만 준다 — 없으면 그 상자의 주소 칸을 그리지 않는다. 6자리 빠진 기본 사무실 주소는 그리지 않는다.
// 송장번호는 배송 조회를 보고 싶을 때만 넣는 선택 칸이다(INV-C7). 받는 주소 없이 보낸 상자는 「받는 주소 없이 보냈어요」로 찾는다(INV-C4 ②).
// 크리에이터 승인은 줄 세운 단계가 아니라 출고의 조건이다 — 진행 줄 아래 따로 한 줄로 그린다.
// 결제 내역은 결제할 때 저장한 금액만 보인다(payment INV-M14, my_gift_payment) — 주문 정보 구간 안, 가는 선 아래에 붙인다(시안 .hr).
// 진행 중이고 도착한 상자가 없으면 주문 정보 구간 끝에 「취소하기」(payment INV-M16, 판정은 features/gift-cancel/model/cancellable.ts).

function Check({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEP_CLASS = { done: s.done, current: s.on, stopped: s.stopped, todo: undefined } as const;

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

const APPROVAL_TEXT = { done: "승인됨", waiting: "승인 대기", todo: "출고 전에 받아요" } as const;

const APPROVAL_TONE = { done: "success", waiting: "warn", todo: "plain" } as const satisfies Record<keyof typeof APPROVAL_TEXT, StatusTone>;

type DifferenceProps = { differences: readonly GiftDifference[]; clientKey: string; notice: DifferenceNotice };

export function GiftStatusPage({
  view,
  boxes,
  difference,
  payment = null,
  replies = [],
  photoBase = "",
  memo = null,
  todo = null,
  todoBoxIds = [],
}: {
  view: FanGiftView;
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
}) {
  const progress = fanProgress(view);
  // 배지의 「N/6」은 지금 있는 단계 번호다 — 끝낸 단계 수(4)를 쓰면 아래 진행 줄의 현재 단계(5번 배송중)와 숫자가 어긋났다(2026-10-09 디자인 점검)
  const currentIdx = view.steps.findIndex((st) => st.state === "current");
  const stepNo = currentIdx >= 0 ? currentIdx + 1 : progress.done;
  // 상자별 원 송장번호는 입고 전까지만 고친다(design-rules 8-1). 출고 운송장은 읽기 함수가 주지 않는다.
  const inProgress = view.outcome === "in_progress";
  // 찾기 대상·받는 주소 판정은 features/box-waybill/model/box-targets.ts (INV-C3·C4 ②)
  const finderBoxes = giftFinderBoxes(boxes, inProgress);
  const anyEditable = finderBoxes.length > 0;
  // 아래 찾기 구간의 고를 상자 — 칸에 있는 상자는 칸에서만 찾는다(INV-J13). 남은 상자가 없으면(전부 칸에 있음) 첫 그림에서 구간을 숨긴다.
  // 원래 찾기 대상이 없던 주문(다 찾음·입고됨)은 예전처럼 구간을 그린다 — 마지막 상자를 찾은 뒤 결과 안내가 남아야 한다
  const belowFinder = finderBoxesBelowTodo(finderBoxes, todoBoxIds);
  const showFinder = !(anyEditable && belowFinder.length === 0);
  const officeAddress = inProgress ? view.officeAddress : null;
  const earlySendAck = needsEarlySendAck(boxes, inProgress);
  // 「먼저 보내기」 전이면 위쪽도 승인 대기로 보인다 — 판정은 fan-stage-copy(view.earlySendPending, INV-S9)
  const badge = fanBadge(view);
  const headline = fanHeadline(view);
  const anyAddress = officeAddress !== null && boxes.some((b) => giftAddressCode(b, officeAddress, inProgress) !== null);
  // 차액 줄은 고른 뒤의 길이로 섹션을 그릴지 정한다 — 끝난 주문에 낸 기록이 없으면 빈 섹션을 그리지 않는다.
  // 결제가 필요한 줄은 맨 위 「지금 할 일」 칸에서만 결제한다(INV-J13) — 아래에는 확인 중·완료·닫힘 줄만. 결제창에서 돌아온 안내는 줄이 없어도 보인다
  const shownDifferences = difference ? differencesBelowTodo(visibleDifferences(difference.differences, view.outcome === "in_progress")) : [];
  // 단계 막대와 상자별 상태는 같은 경우(진행 중·돌려보냄)에만 보인다
  const showsProgress = showsSteps(view);
  const cancelable = canCancelGift(boxes, inProgress);

  // 오른쪽 요약 상자의 「추가 결제 N원」 꼬리표(시안 v34-part1 .sidebox .tag.warn) — 아직 내지 않은 차액의 합. 결제는 맨 위 칸에서만 한다(INV-J13)
  const dueKrw = (difference?.differences ?? []).filter((d) => d.state === "due").reduce((sum, d) => sum + d.amountKrw, 0);

  return (
    <main id="main" className={`page-centered ${s.page}`}>
      <div className={s.col}>
        <Link className={s.back} href="/gifts">
          ‹ 보낸 선물로
        </Link>
        {/* 맨 위 「지금 할 일」 칸은 두 단 위 전체 폭(시안 v34-part1/gift-detail.html) */}
        <div className={s.top} data-detail-top="">
          {todo}
          <div className={payment ? s.two : s.one}>
            {payment ? (
              <aside className={s.side} aria-label="결제 요약">
                <div className={s.sidebox}>
                  <p className={s.tot}>
                    <span className={s.lab}>합계</span>
                    <b>{won(payment.paidKrw)}</b>
                  </p>
                  {dueKrw > 0 ? <span className={`${statusTagClass("warn")} ${s.sidetag}`}>추가 결제 {won(dueKrw)}</span> : null}
                  <p className={s.pn}>
                    {formatDate(payment.paidAt)}에 {won(payment.paidKrw)}을 결제했어요.
                  </p>
                </div>
              </aside>
            ) : null}
            <div className={s.main}>
              <section className={s.hcard} aria-labelledby="g-title">
                <img className={s.peek} src="/images/home/icon-truck.webp" alt="" aria-hidden="true" width={96} height={96} />
                <p className={s.meta}>
                  주문번호 {view.orderNo} · 등록 {formatDate(view.registeredAt)}
                </p>
                <h1 className={s.title} id="g-title">
                  {view.creatorName}님께 보내는 선물
                </h1>
                <p className={s.lead}>
                  {view.itemKind} · 상자 {view.boxCount}개
                </p>
                <div className={s.stat}>
                  {view.outcome === "in_progress" ? (
                    <span className="num-big">
                      {stepNo}/{progress.total}
                    </span>
                  ) : null}
                  <span className={statusTagClass(badge.tone)}>{badge.text}</span>
                  <strong className={s.headline}>{headline}</strong>
                </div>

                {showsProgress ? (
                  <>
                    <ol className={s.steps} aria-label={`선물 진행 단계 ${progress.total}단계 중 ${progress.done}단계 완료`}>
                      {view.steps.map((st) => {
                        const detail = fanStepDetail(st, view);
                        return (
                          <li key={st.key} className={STEP_CLASS[st.state]} aria-current={st.state === "current" ? "step" : undefined}>
                            <span className={s.stepName}>
                              {FAN_STEP_LABEL[st.key]}
                              {st.state === "done" ? <span className="sr-only"> 완료</span> : null}
                              {st.state === "stopped" ? <span className="sr-only"> 멈춤</span> : null}
                            </span>
                            {detail ? <small>{detail}</small> : null}
                          </li>
                        );
                      })}
                    </ol>
                    {/* 크리에이터 승인은 줄 세운 단계가 아니라 출고의 조건이다 — 진행 줄 아래 따로 한 줄로 */}
                    {view.outcome === "in_progress" ? (
                      <p className={s.appr}>
                        <span className={statusTagClass(APPROVAL_TONE[view.approval.state])}>
                          {view.approval.state === "done" ? <Check size={16} /> : null}
                          {APPROVAL_TEXT[view.approval.state]}
                        </span>
                        <span>
                          {APPROVAL_LABEL}
                          {view.approval.state === "done" && view.approval.at ? <span> · {formatDate(view.approval.at)}</span> : null}
                        </span>
                      </p>
                    ) : null}
                  </>
                ) : null}

                {/* 도착 예정일 — 진행 카드 아래 한 줄(시안 v33.css .eta) */}
                {view.expectedArrivalDate ? (
                  <div className={s.eta}>
                    <h2 className={s.etaLab}>도착 예정일</h2>
                    <p className={s.etaVal}>{formatDate(view.expectedArrivalDate)} 전후</p>
                  </div>
                ) : null}
              </section>

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
                  <p className={s.desc}>받는 주소가 보이기 전에 끝났다면 결제 금액을 모두 돌려드려요.</p>
                  <p className={s.more}>사무실에 도착한 상자는 보낸 주소로 돌려보내 드리고, 그 상자의 반송 택배비를 뺀 금액을 돌려드려요.</p>
                  <p className={s.more}>
                    아직 도착하지 않은 상자는 택배비를 뺀 금액을 먼저 돌려드려요. 이미 보내셨다면 도착하는 대로 돌려보내 드리고, 7일 안에 도착하지 않으면
                    택배비도 돌려드려요.
                  </p>
                </div>
              ) : null}

              {showsProgress && boxes.length > 0 ? (
                <div className={s.sec} data-sec="">
                  {/* 「먼저 보내기」를 누르면 안내 칸이 사라진다 — 포커스는 그대로 남는 이 제목으로 옮긴다 */}
                  <h2 className={s.secTitle} id="box-status-title" tabIndex={-1}>
                    상자
                  </h2>
                  {earlySendAck ? <EarlySendGate orderNo={view.orderNo} creatorName={view.creatorName} focusAfterId="box-status-title" /> : null}
                  {anyAddress ? (
                    <p className={s.desc}>상자마다 받는 주소가 달라요. 상자에 맞는 주소를 끝 6자리까지 그대로 써서 보내 주세요. 승인은 출고 전까지만 나면 돼요.</p>
                  ) : null}
                  {anyEditable ? <p className={s.note}>송장번호는 배송 조회를 보고 싶을 때만 넣으면 돼요.</p> : null}
                  <div className={s.boxes}>
                    {boxes.map((b) => {
                      const tierName = boxTierName(b.tier);
                      const addressCode = giftAddressCode(b, officeAddress, inProgress);
                      const stateTag = fanBoxStateTag(b.state);
                      return (
                        <div key={b.boxId} className={s.box}>
                          <div className={s.boxline}>
                            <h3 className={s.boxName}>
                              {b.label}
                              {tierName ? <span className={s.boxTier}> · {tierName}</span> : null}
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
                            ) : (
                              <span className="tag">아직 도착 전</span>
                            )}
                          </div>
                          {isMissing(b.state) ? (
                            <p className="hint">결제하고 30일이 지나도 도착하지 않아 이 상자는 닫혔어요. 이 상자 금액을 돌려드려요. 이제 이 상자를 보내도 받지 않고 돌려보내요.</p>
                          ) : null}
                          {officeAddress && addressCode ? (
                            <ReceivingAddress officeAddress={officeAddress} code={addressCode} boxName={b.label} multiple={boxes.length > 1} />
                          ) : null}
                          {isWaybillEditable(b.state) && inProgress ? (
                            <WaybillEditor
                              target={{ kind: "box", id: b.boxId }}
                              boxName={b.label}
                              initial={b.waybillNo}
                              layout="box"
                              hint="선택이에요. 넣으면 배송 조회로 팬꾹까지 오는 길을 보여 드려요."
                            />
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
                </div>
              ) : null}

              {/* 받는 주소 없이 보냈어요(inbound-address-code INV-C4 ②) — 진행 중 주문이면 늘 그린다. 마지막 상자를 찾아 고를 상자가 없어져도
                  결과 안내가 남아 있게, 빈 목록은 칸 안에서 처리한다. 잇는 판정은 DB 가 한다 */}
              {showsProgress && inProgress && boxes.length > 0 ? (
                <KeepShown key={view.orderNo} show={showFinder}>
                  <div className={s.sec} data-sec="">
                    <h2 className={s.secTitle}>받는 주소 없이 보냈어요</h2>
                    <p className={s.desc}>받는 주소 끝 6자리를 빼고 보낸 상자는 사무실에서 바로 찾지 못해요. 송장번호와 택배사가 맞으면 찾아요.</p>
                    <div className={s.inner}>
                      <FindMyBox boxes={belowFinder} />
                    </div>
                    <p className="hint">틀린 입력은 하루에 다섯 번까지예요. 사무실에는 도착 시각과 택배사만 남기고, 주소와 전화번호는 남기지 않아요.</p>
                  </div>
                </KeepShown>
              ) : null}

              <section className={s.sec} aria-labelledby="info-title">
                <h2 className={s.secTitle} id="info-title">
                  주문 정보
                </h2>
                <dl className={s.kv}>
                  <div>
                    <dt>주문번호</dt>
                    <dd>{view.orderNo}</dd>
                  </div>
                  <div>
                    <dt>받는 크리에이터</dt>
                    <dd>{view.creatorName}</dd>
                  </div>
                  <div>
                    <dt>선물</dt>
                    <dd>{view.itemKind}</dd>
                  </div>
                  <div>
                    <dt>상자</dt>
                    <dd>{view.boxCount}개</dd>
                  </div>
                  <div>
                    <dt>등록</dt>
                    <dd>{formatDateTime(view.registeredAt)}</dd>
                  </div>
                </dl>
                {payment ? null : (
                  <p className={s["tag-line"]}>
                    <span className="tag">
                      <Check size={16} />
                      검수 포함
                    </span>
                  </p>
                )}
                {hasShipped(view) ? (
                  <p className={s.note}>{PROMISE.addressFan} 그래서 크리에이터에게 가는 송장번호도 알려 드리지 않아요. 진행 상황은 이 화면에서 볼 수 있어요.</p>
                ) : null}
                {payment ? <PaymentSummary payment={payment} differences={difference?.differences ?? []} /> : null}
                {cancelable ? (
                  <div className={s.cancel}>
                    <CancelGiftButton orderNo={view.orderNo} addressShown={!view.earlySendPending} />
                  </div>
                ) : null}
              </section>

              {/* 결제가 끝난 진행 중 주문 — 상자를 더 보내는 길은 없다(스펙 비범위: 상자 추가). 도착한 뒤에는 더 보낼 일이 없어 접는다 */}
              {anyAddress && view.canEnterTrackingNo ? (
                <div className={s.sec} data-sec="">
                  <h2 className={s.secTitle}>보내기 전에 알아 두세요</h2>
                  <p className={s.desc}>상자를 더 보내려면 새로 등록해 주세요. 상자마다 받는 주소가 달라요.</p>
                  <p className={s.more}>{RETURN_ON_REJECT_NOTICE}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
