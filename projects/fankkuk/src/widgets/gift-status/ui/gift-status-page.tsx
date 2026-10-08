import { statusTagClass, type StatusTone } from "@/shared/ui/status-tone";
import Link from "next/link";
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
import { boxTierName, canReportNotMine, hasArrived, isMissing, isWaybillEditable, type GiftBox } from "@/entities/parcel/model/box-rows";
import { giftAddressCode, giftFinderBoxes, needsEarlySendAck } from "@/features/box-waybill/model/box-targets";
import { EarlySendGate } from "@/features/box-waybill/ui/early-send-gate";
import { RETURN_ON_INSPECTION_NOTICE } from "@/entities/parcel/model/size-tier";
import { formatWaybill } from "@/entities/parcel/model/waybill-no";
import { FindMyBox } from "@/features/box-waybill/ui/find-my-box";
import { NotMineButton } from "@/features/box-waybill/ui/not-mine-button";
import { ReceivingAddress } from "@/features/box-waybill/ui/receiving-address";
import { WaybillEditor } from "@/features/box-waybill/ui/waybill-editor";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { visibleDifferences, type GiftDifference } from "@/entities/payment/model/difference-rows";
import type { GiftPayment } from "@/entities/payment/model/gift-payment";
import { DifferenceSection, type DifferenceNotice } from "./difference-section";
import { PaymentSummary } from "./payment-summary";
import s from "./gift-status.module.css";

// 팬 — 선물 하나의 상태. 시안: docs/design/mockups/site/v9-pages/gift-a.html (design-rules 5절, 카드 d45 — 시안은 한 상태의 예시, 칸이 나오는 조건은 아래 그대로)
// 문의하지 않아도 지금 어디까지 왔는지 알 수 있게(성공 기준 3).
// 크리에이터에게 보내는 송장번호는 이 화면에 오지 않는다 — toFanView·my_gift_boxes 가 걸러서 넘긴다.
// 상자별 칸 시안: docs/design/mockups/site/v4/gift-boxes.html. 헤더·푸터는 라우트가 붙인다.
// 받는 주소(inbound-address-code INV-C2·C3): 결제가 끝난 진행 중 주문의 상자마다 「이 선물의 받는 주소」(사무실 주소 + 6자리).
//   6자리는 my_gift_boxes 가 로그인한 주인에게, 유효할 때만 준다 — 없으면 그 상자의 주소 칸을 그리지 않는다. 6자리 빠진 기본 사무실 주소는 그리지 않는다.
// 송장번호는 배송 조회를 보고 싶을 때만 넣는 선택 칸이다(INV-C7). 받는 주소 없이 보낸 상자는 「받는 주소 없이 보냈어요」로 찾는다(INV-C4 ②).
// 입고된 뒤 출고 확정 전에는 상자마다 「제가 보낸 게 아니에요」(INV-C8).
// 크리에이터 승인은 줄 세운 단계가 아니라 출고의 조건이다 — 진행 줄 아래 따로 한 줄로 그린다.
// 결제 내역은 결제할 때 저장한 금액만 보인다(payment INV-M14, my_gift_payment) — 주문 정보 중립 면 카드 안에 붙인다.

function Check({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEP_CLASS = { done: s["is-done"], current: s["is-current"], stopped: s["is-stopped"], todo: undefined } as const;

const APPROVAL_TEXT = { done: "승인됨", waiting: "기다리는 중", todo: "출고 전에 받아요" } as const;

const APPROVAL_TONE = { done: "success", waiting: "warn", todo: "plain" } as const satisfies Record<keyof typeof APPROVAL_TEXT, StatusTone>;

type DifferenceProps = { differences: readonly GiftDifference[]; clientKey: string; notice: DifferenceNotice };

export function GiftStatusPage({
  view,
  boxes,
  difference,
  payment = null,
}: {
  view: FanGiftView;
  boxes: readonly GiftBox[];
  difference?: DifferenceProps;
  /** 결제 금액(저장된 값). 없으면 결제 내역을 그리지 않는다. */
  payment?: GiftPayment | null;
}) {
  const progress = fanProgress(view);
  // 상자별 원 송장번호는 입고 전까지만 고친다(design-rules 8-1). 출고 운송장은 읽기 함수가 주지 않는다.
  const inProgress = view.outcome === "in_progress";
  // 찾기 대상·받는 주소 판정은 features/box-waybill/model/box-targets.ts (INV-C3·C4 ②)
  const finderBoxes = giftFinderBoxes(boxes, inProgress);
  const anyEditable = finderBoxes.length > 0;
  const officeAddress = inProgress ? view.officeAddress : null;
  const earlySendAck = needsEarlySendAck(boxes, inProgress);
  // 「먼저 보내기」 전이면 위쪽도 승인 대기로 보인다 — 판정은 fan-stage-copy(view.earlySendPending, INV-S9)
  const badge = fanBadge(view);
  const headline = fanHeadline(view);
  const anyAddress = officeAddress !== null && boxes.some((b) => giftAddressCode(b, officeAddress, inProgress) !== null);
  // 차액 줄은 고른 뒤의 길이로 섹션을 그릴지 정한다 — 끝난 주문에 낸 기록이 없으면 빈 섹션을 그리지 않는다
  const shownDifferences = difference ? visibleDifferences(difference.differences, view.outcome === "in_progress") : [];
  // 단계 막대와 상자별 상태는 같은 경우(진행 중·돌려보냄)에만 보인다
  const showsProgress = showsSteps(view);

  return (
    <main id="main">
      <div className={`container ${s.crumb}`}>
        <Link href="/gifts">‹ 선물 내역으로</Link>
      </div>

      <section aria-labelledby="g-title">
        <div className="container">
          <div className={s["g-panel"]}>
            <div className={s["g-top"]}>
              <div>
                <p className={s.meta}>
                  주문번호 {view.orderNo} · 등록 {formatDate(view.registeredAt)}
                </p>
                <h1 className={s["g-title"]} id="g-title">
                  {view.creatorName}님께 보내는 선물
                </h1>
                <p className={s["g-lead"]}>
                  {view.itemKind} · 상자 {view.boxCount}개
                </p>
                <div className={s["g-now"]}>
                  <span className={statusTagClass(badge.tone, s["g-state"])}>
                    {view.outcome === "in_progress" ? `${badge.text} · ${progress.done}/${progress.total}` : badge.text}
                  </span>
                  <strong>{headline}</strong>
                </div>
              </div>
              <div className={s["g-art"]} aria-hidden="true">
                <img className={`asset ${s.a1}`} src="/img/icon-truck.png" alt="" width={200} height={160} />
                <img className={`asset ${s.a2}`} src="/img/icon-gift.png" alt="" width={72} height={72} />
              </div>
            </div>

            {showsProgress ? (
              <div className={s.track}>
                <ol className={s.stepper} aria-label={`선물 진행 단계 ${progress.total}단계 중 ${progress.done}단계 완료`}>
                  {view.steps.map((st, i) => {
                    const detail = fanStepDetail(st, view);
                    return (
                      <li key={st.key} className={STEP_CLASS[st.state]} aria-current={st.state === "current" ? "step" : undefined}>
                        <span className={s.sn}>{st.state === "done" ? <Check /> : i + 1}</span>
                        <span className={s["step-text"]}>
                          {FAN_STEP_LABEL[st.key]}
                          {st.state === "done" ? <span className="sr-only"> 완료</span> : null}
                          {st.state === "stopped" ? <span className="sr-only"> 멈춤</span> : null}
                          {detail ? <span className={s.t}>{detail}</span> : null}
                        </span>
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
                    {APPROVAL_LABEL}
                    {view.approval.state === "done" && view.approval.at ? <span className={s.t}> · {formatDate(view.approval.at)}</span> : null}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={s.two}>
            <div className={s.stack}>
              {/* 차액 결제(payment INV-M11·M12·M13) — 차액 요청이 있는 주문에만. 진행 중이 아니면 낸 기록만 남는다 */}
              {difference && shownDifferences.length > 0 ? (
                <DifferenceSection
                  orderNo={view.orderNo}
                  differences={shownDifferences}
                  clientKey={difference.clientKey}
                  notice={difference.notice}
                />
              ) : null}
              {view.outcome === "returned" ? (
                <div className={s.part}>
                  <h2>돌려보내 드렸어요</h2>
                  <p className={s["sub-t"]}>{RETURN_ON_INSPECTION_NOTICE}</p>
                </div>
              ) : null}
              {view.outcome === "not_accepted" ? (
                <div className={s.part}>
                  <h2>이 선물은 보내지 마세요</h2>
                  <p className={s["sub-t"]}>
                    아직 보내지 않았다면 보내지 마세요 — 결제 금액을 모두 돌려드려요. 이미 사무실에 도착했다면 보낸 주소로
                    돌려보내 드리고, 반송 택배비를 뺀 금액을 돌려드려요.
                  </p>
                </div>
              ) : null}

              {showsProgress && boxes.length > 0 ? (
                <div className={s.part}>
                  {/* 「먼저 보내기」를 누르면 안내 칸이 사라진다 — 포커스는 그대로 남는 이 제목으로 옮긴다 */}
                  <h2 id="box-status-title" tabIndex={-1}>
                    상자별 상태
                  </h2>
                  {earlySendAck ? <EarlySendGate orderNo={view.orderNo} creatorName={view.creatorName} focusAfterId="box-status-title" /> : null}
                  {anyAddress ? (
                    <p className={s["sub-t"]}>
                      상자마다 받는 주소가 달라요. 상자에 맞는 주소를 끝 6자리까지 그대로 써서 보내 주세요. 승인은 출고 전까지만 나면 돼요.
                    </p>
                  ) : null}
                  {anyEditable ? <p className={s["sub-t"]}>송장번호는 배송 조회를 보고 싶을 때만 넣으면 돼요.</p> : null}
                  <div className={s["box-rows"]}>
                    {boxes.map((b) => {
                      const tierName = boxTierName(b.tier);
                      const addressCode = giftAddressCode(b, officeAddress, inProgress);
                      return (
                        <div key={b.boxId} className={s["box-row"]}>
                          <div className={s["box-top"]}>
                            <div>
                              <h3>{b.label}</h3>
                              {tierName ? <p className="sub">{tierName}</p> : null}
                            </div>
                            {hasArrived(b.state) ? (
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
                              <div className={s["inv-fixed"]}>
                                <span className="sub">송장번호</span>
                                <span className={s.no}>{formatWaybill(b.waybillNo)}</span>
                              </div>
                              {hasArrived(b.state) ? <p className="hint">입고된 상자는 송장번호를 고칠 수 없어요.</p> : null}
                            </>
                          ) : null}
                          {inProgress && canReportNotMine(b.state) ? (
                            <NotMineButton target={{ kind: "box", id: b.boxId }} boxName={b.label} reported={b.reportedNotMine} />
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
                <div className={s.part}>
                  <h2>받는 주소 없이 보냈어요</h2>
                  <p className={s["sub-t"]}>받는 주소 끝 6자리를 빼고 보낸 상자는 사무실에서 바로 찾지 못해요. 송장번호·택배사·보낸 사람 이름 첫 글자가 모두 맞으면 내 상자로 이어져요.</p>
                  <FindMyBox boxes={finderBoxes} />
                  <p className={`${s["sub-t"]} ${s["sub-t--gap"]}`}>
                    하루에 다섯 번까지 찾을 수 있어요. 사무실에는 도착 시각·택배사·보낸 사람 이름 첫 글자만 남기고, 주소와 전화번호는 남기지 않아요.
                  </p>
                </div>
              ) : null}

              {/* 결제가 끝난 진행 중 주문 — 상자를 더 보내는 길은 없다(스펙 비범위: 상자 추가). 도착한 뒤에는 더 보낼 일이 없어 접는다 */}
              {anyAddress && view.canEnterTrackingNo ? (
                <div className={s.part}>
                  <h2>보내기 전에 알아 두세요</h2>
                  <p className={s["sub-t"]}>상자를 더 보내려면 새로 등록해 주세요. 상자마다 받는 주소가 달라요.</p>
                  <p className={`${s["sub-t"]} ${s["sub-t--gap"]}`}>{RETURN_ON_REJECT_NOTICE}</p>
                </div>
              ) : null}
            </div>

            <div className={s.stack}>
              {view.expectedArrivalDate ? (
                <div className={s.eta}>
                  <span className={s["ico-tile"]} aria-hidden="true">
                    <img className="asset" src="/img/icon-truck.png" alt="" width={44} height={44} />
                  </span>
                  <div>
                    <h2>도착 예정일</h2>
                    <strong>{formatDate(view.expectedArrivalDate)} 전후</strong>
                  </div>
                </div>
              ) : null}
              <section className={s.info} aria-labelledby="info-title">
                <h2 id="info-title">주문 정보</h2>
                <dl>
                  <div className={s["info-row"]}>
                    <dt>주문번호</dt>
                    <dd>{view.orderNo}</dd>
                  </div>
                  <div className={s["info-row"]}>
                    <dt>받는 크리에이터</dt>
                    <dd>{view.creatorName}</dd>
                  </div>
                  <div className={s["info-row"]}>
                    <dt>선물</dt>
                    <dd>{view.itemKind}</dd>
                  </div>
                  <div className={s["info-row"]}>
                    <dt>상자</dt>
                    <dd>{view.boxCount}개</dd>
                  </div>
                  <div className={s["info-row"]}>
                    <dt>등록</dt>
                    <dd>{formatDateTime(view.registeredAt)}</dd>
                  </div>
                </dl>
                {payment ? <PaymentSummary payment={payment} differences={difference?.differences ?? []} /> : null}
                <span className="tag">
                  <Check size={16} />
                  추적 장치 검수 포함
                </span>
                {hasShipped(view) ? (
                  <p className={s["info-note"]}>
                    크리에이터의 주소를 지키기 위해, 크리에이터에게 가는 택배의 송장번호는 알려 드리지 않아요. 배송 단계는 이
                    화면에서 확인할 수 있어요.
                  </p>
                ) : null}
              </section>
            </div>
          </div>
          <div className="page-end" />
        </div>
      </section>
    </main>
  );
}
