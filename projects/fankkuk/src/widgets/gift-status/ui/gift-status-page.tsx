import Link from "next/link";
import { Fragment } from "react";
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
import { TrackingInput } from "@/features/tracking-input/ui/tracking-input";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { CopyButton } from "./copy-button";
import s from "./gift-status.module.css";

// 팬 — 선물 하나의 상태. 시안: docs/design/mockups/site/v4/gift.html
// 문의하지 않아도 지금 어디까지 왔는지 알 수 있게(성공 기준 3).
// 크리에이터에게 보내는 송장번호는 이 화면에 오지 않는다 — toFanView 가 걸러서 넘긴다.
// 사무실 주소는 view.officeAddress 가 있을 때(결제가 끝난 진행 중 주문)만 그린다(INV-S9). 헤더·푸터는 라우트가 붙인다.
// 크리에이터 승인은 줄 세운 단계가 아니라 출고의 조건이다 — 검수와 출고 사이에서 갈라져 붙는 칸으로 그린다.

function Check({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEP_CLASS = { done: s["is-done"], current: s["is-current"], stopped: s["is-stopped"], todo: undefined } as const;

const APPROVAL_TEXT = { done: "승인됨", waiting: "기다리는 중", todo: "출고 전에 받아요" } as const;

export function GiftStatusPage({ view }: { view: FanGiftView }) {
  const badge = fanBadge(view);
  const progress = fanProgress(view);
  const current = view.steps.find((st) => st.state === "current");
  const currentDetail = current ? fanStepDetail(current, view) : null;
  const arrived = view.steps.some((st) => st.key === "received" && st.state === "done");
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
          <div className={s["g-head"]}>
            <div>
              <p className={s.meta}>
                주문번호 {view.orderNo} · 등록 {formatDate(view.registeredAt)}
              </p>
              <h1 className="page-h" id="g-title">
                {view.creatorName}님께 보내는 선물
              </h1>
              <p className={`lead ${s["g-lead"]}`}>
                {view.itemKind} · 상자 {view.boxCount}개
              </p>
            </div>
            <span className={`tag ${badge.tone === "brand" ? "tag--brand" : ""} ${s["g-state"]}`}>
              {view.outcome === "in_progress" ? `${badge.text} · ${progress.done}/${progress.total}` : badge.text}
            </span>
          </div>

          {showsProgress ? (
            <>
              <ol className={s.stepper} aria-label={`선물 진행 단계 ${progress.total}단계 중 ${progress.done}단계 완료`}>
                {view.steps.map((st, i) => (
                  <Fragment key={st.key}>
                    <li className={STEP_CLASS[st.state]} aria-current={st.state === "current" ? "step" : undefined}>
                      <span className={s.sn}>{st.state === "done" ? <Check /> : i + 1}</span>
                      <span>
                        {FAN_STEP_LABEL[st.key]}
                        {st.state === "done" ? <span className="sr-only"> 완료</span> : null}
                        {st.state === "stopped" ? <span className="sr-only"> 멈춤</span> : null}
                      </span>
                    </li>
                    {st.key === "inspected" && view.outcome === "in_progress" ? (
                      <li className={s.branch} data-state={view.approval.state}>
                        <span className={s["branch-line"]} aria-hidden="true" />
                        <span className={s["branch-pill"]}>
                          {view.approval.state === "done" ? <Check size={16} /> : null}
                          {APPROVAL_LABEL}
                          <span className={s["branch-state"]}>
                            <span className="sr-only">: </span>
                            {view.approval.state === "done" && view.approval.at
                              ? `${APPROVAL_TEXT.done} · ${formatDate(view.approval.at)}`
                              : APPROVAL_TEXT[view.approval.state]}
                          </span>
                        </span>
                      </li>
                    ) : null}
                  </Fragment>
                ))}
              </ol>
              <p className={s["step-note"]}>
                <strong>{fanHeadline(view)}</strong>
                {currentDetail ? ` · ${currentDetail}` : null}
              </p>
            </>
          ) : (
            <p className={s["step-note"]}>
              <strong>{fanHeadline(view)}</strong>
            </p>
          )}

          <div className={s.two}>
            <div>
              {view.outcome === "not_accepted" ? (
                <div className={s.part}>
                  <h2>이 선물은 보내지 마세요</h2>
                  <p className={s["sub-t"]}>
                    아직 보내지 않았다면 보내지 마세요 — 결제 금액을 모두 돌려드려요. 이미 사무실에 도착했다면 보낸 주소로
                    돌려보내 드리고, 반송 택배비를 뺀 금액을 돌려드려요.
                  </p>
                </div>
              ) : null}

              {showsProgress ? (
                <div className={s.part}>
                  <h2>상자별 상태</h2>
                  <div className={s["box-rows"]}>
                    {Array.from({ length: view.boxCount }, (_, i) => (
                      <div key={i} className={s["box-row"]}>
                        <div className={s["box-top"]}>
                          <h3>
                            {view.orderNo}-{i + 1}
                          </h3>
                          {arrived ? (
                            <span className="tag tag--brand">
                              <Check size={16} />
                              입고 완료
                            </span>
                          ) : (
                            <span className="tag">아직 도착 전</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {view.canEnterTrackingNo ? (
                    <div className={s.tracking}>
                      <TrackingInput initial={view.fanTrackingNo} />
                    </div>
                  ) : view.fanTrackingNo ? (
                    <p className={s["inv-no"]}>
                      내 송장번호 <strong>{view.fanTrackingNo}</strong>
                    </p>
                  ) : null}
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
                      <CopyButton className="btn btn--soft btn--sm" text={`${view.officeAddress}\n${recipient}`} label="주소 복사하기" />
                    </div>
                  </div>
                  <p className={`${s["sub-t"]} ${s["sub-t--gap"]}`}>
                    받는 사람 이름에 주문번호가 있어야 도착한 상자를 바로 찾을 수 있어요.
                  </p>
                  <p className={`${s["sub-t"]} ${s["sub-t--gap"]}`}>{RETURN_ON_REJECT_NOTICE}</p>
                </div>
              ) : null}
            </div>

            <div>
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
