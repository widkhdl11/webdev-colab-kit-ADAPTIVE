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
import { boxTierName, hasArrived, isWaybillEditable, type GiftBox } from "@/entities/parcel/model/box-rows";
import { RETURN_ON_INSPECTION_NOTICE } from "@/entities/parcel/model/size-tier";
import { formatWaybill } from "@/entities/parcel/model/waybill-no";
import { FindMyBox } from "@/features/box-waybill/ui/find-my-box";
import { WaybillEditor } from "@/features/box-waybill/ui/waybill-editor";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { visibleDifferences, type GiftDifference } from "@/entities/payment/model/difference-rows";
import type { GiftPayment } from "@/entities/payment/model/gift-payment";
import { CopyButton } from "@/shared/ui/copy-button";
import { DifferenceSection, type DifferenceNotice } from "./difference-section";
import { PaymentSummary } from "./payment-summary";
import s from "./gift-status.module.css";

// 팬 — 선물 하나의 상태. 시안: docs/design/mockups/site/v9-pages/gift-a.html (design-rules 5절, 카드 d45 — 시안은 한 상태의 예시, 칸이 나오는 조건은 아래 그대로)
// 문의하지 않아도 지금 어디까지 왔는지 알 수 있게(성공 기준 3).
// 크리에이터에게 보내는 송장번호는 이 화면에 오지 않는다 — toFanView·my_gift_boxes 가 걸러서 넘긴다.
// 상자별 원 송장번호·내 물건 찾기 시안: docs/design/mockups/site/v4/gift-boxes.html (택배사 고르는 칸은 DB 에 그 칸이 없어 뺐다).
// 사무실 주소는 view.officeAddress 가 있을 때(결제가 끝난 진행 중 주문)만 그린다(INV-S9). 헤더·푸터는 라우트가 붙인다.
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
  const badge = fanBadge(view);
  const progress = fanProgress(view);
  // 상자별 원 송장번호는 입고 전까지만 고친다(design-rules 8-1). 출고 운송장은 읽기 함수가 주지 않는다.
  const editableBoxes = view.outcome === "in_progress" ? boxes.filter((b) => isWaybillEditable(b.state)) : [];
  const anyEditable = editableBoxes.length > 0;
  const finderBoxes = editableBoxes.map((b) => {
    const tierName = boxTierName(b.tier);
    return { boxId: b.boxId, label: b.label, name: tierName ? `${b.label} · ${tierName}` : b.label };
  });
  // 차액 줄은 고른 뒤의 길이로 섹션을 그릴지 정한다 — 끝난 주문에 낸 기록이 없으면 빈 섹션을 그리지 않는다
  const shownDifferences = difference ? visibleDifferences(difference.differences, view.outcome === "in_progress") : [];
  // 단계 막대와 상자별 상태는 같은 경우(진행 중·돌려보냄)에만 보인다
  const showsProgress = showsSteps(view);
  const recipient = `팬꾹 ${view.orderNo}`;

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
                  <strong>{fanHeadline(view)}</strong>
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
                  <h2>상자별 상태</h2>
                  {anyEditable ? <p className={s["sub-t"]}>상자마다 보낸 택배의 송장번호를 넣어 주세요. 사무실에서 상자를 찾는 데 쓰여요.</p> : null}
                  <div className={s["box-rows"]}>
                    {boxes.map((b) => {
                      const tierName = boxTierName(b.tier);
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
                            ) : (
                              <span className="tag">아직 도착 전</span>
                            )}
                          </div>
                          {isWaybillEditable(b.state) && view.outcome === "in_progress" ? (
                            <WaybillEditor
                              target={{ kind: "box", id: b.boxId }}
                              boxName={b.label}
                              initial={b.waybillNo}
                              layout="box"
                              hint="상자 하나에 송장번호 하나예요. 상자가 여러 개면 상자마다 따로 넣어 주세요."
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* 내 물건 찾기(office-workflow INV-W5) — 진행 중 주문이면 늘 그린다. 마지막 상자를 찾아 고를 상자가 없어져도
                  결과 안내가 남아 있게, 빈 목록은 칸 안에서 처리한다. 잇는 판정은 DB 가 한다 */}
              {showsProgress && view.outcome === "in_progress" && boxes.length > 0 ? (
                <div className={s.part}>
                  <h2>내 물건 찾기</h2>
                  <p className={s["sub-t"]}>보낸 상자가 사무실에 도착했는데 주문과 이어지지 않았을 때 쓰는 칸이에요.</p>
                  <FindMyBox boxes={finderBoxes} />
                  <p className={`${s["sub-t"]} ${s["sub-t--gap"]}`}>
                    사무실에서 보이는 건 도착 시각과 보낸 사람 이름 앞 한 글자, 보관 선반 번호뿐이에요. 주소와 전화번호는 남기지 않아요.
                  </p>
                </div>
              ) : null}

              {/* 결제가 끝난 진행 중 주문에 주소가 온다 — 승인을 기다리지 않는다(INV-S9). 도착한 뒤에는 더 보낼 일이 없어 접는다 */}
              {view.officeAddress && view.canEnterTrackingNo ? (
                <div className={s.part}>
                  <h2>보내실 주소</h2>
                  <p className={s["sub-t"]}>이 선물에만 쓰는 팬꾹 사무실 주소예요. {view.creatorName}님의 승인은 기다리지 않고 보내 주세요 — 출고 전에 받아요.</p>
                  <div className={s.addr}>
                    <p className={s["addr-title"]}>이 주소로 보내 주세요</p>
                    <dl>
                      <div>
                        <dt>받는 곳</dt>
                        <dd>{view.officeAddress}</dd>
                      </div>
                      <div>
                        <dt>받는 사람</dt>
                        <dd>{recipient} (주문번호를 꼭 같이 적어 주세요)</dd>
                      </div>
                    </dl>
                    <div className={s["addr-copy"]}>
                      <CopyButton className="btn btn--soft btn--sm" text={`${view.officeAddress}\n${recipient}`} label="주소 복사하기" copiedMessage="주소를 복사했어요." failedMessage="복사하지 못했어요. 위 주소를 직접 옮겨 적어 주세요." />
                    </div>
                  </div>
                  <p className={`${s["sub-t"]} ${s["sub-t--gap"]}`}>
                    받는 사람 이름에 주문번호가 있어야 도착한 상자를 바로 찾을 수 있어요.
                  </p>
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
