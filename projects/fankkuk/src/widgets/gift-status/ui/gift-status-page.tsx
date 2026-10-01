import type { FanGiftView } from "@/entities/order/model/fan-view";
import { FAN_STEP_LABEL, fanHeadline, fanStepDetail, hasShipped, showsSteps } from "@/entities/order/ui/fan-stage-copy";
import { TrackingInput } from "@/features/tracking-input/ui/tracking-input";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { AppHeader } from "@/shared/ui/app-header";
import s from "@/shared/ui/screen.module.css";
import t from "./gift-status.module.css";

// 팬 — 선물 하나의 상태. 문의하지 않아도 지금 어디까지 왔는지 알 수 있게(성공 기준 3).
// 크리에이터에게 보내는 송장번호는 이 화면에 오지 않는다 — toFanView 가 걸러서 넘긴다.

function Check() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GiftStatusPage({ view }: { view: FanGiftView }) {
  return (
    <div className={`${s.root} ${s.page}`}>
      <AppHeader link={{ href: "/gifts", label: "내 선물" }} />
      <main className={s.main}>
        <p className={s.eyebrow}>{view.orderNo}</p>
        <h1>{fanHeadline(view)}</h1>
        <p className={s.lead}>
          {view.creatorName}에게 보내는 {view.itemKind}
          {view.boxCount > 1 ? ` · 상자 ${view.boxCount}개` : ""}
        </p>

        {view.outcome === "not_accepted" ? (
          <div className={`${s["card-tint"]} ${s.section}`}>
            <p>
              아직 보내지 않았다면 보내지 마세요. 이미 사무실에 도착했다면 보낸 주소로 돌려보내 드려요. 결제는 주문
              상태에 따라 돌려드려요.
            </p>
          </div>
        ) : null}

        {view.officeAddress && view.canEnterTrackingNo ? (
          <section className={`${s["card-tint"]} ${s.section}`} aria-labelledby="send-title">
            <h2 id="send-title" className={t["card-title"]}>
              이 주소로 보내 주세요
            </h2>
            <dl className={`${s.rows} ${t.address}`}>
              <div>
                <dt>주소</dt>
                <dd>{view.officeAddress}</dd>
              </div>
              <div>
                <dt>받는 사람</dt>
                <dd>팬꾹 {view.orderNo}</dd>
              </div>
            </dl>
            <p className={`${s.note} ${t.gap}`}>받는 사람 이름에 주문번호를 꼭 같이 적어 주세요. 그래야 도착한 상자를 바로 찾아요.</p>
            <div className={`${s.card} ${t.gap}`}>
              <TrackingInput initial={view.fanTrackingNo} />
            </div>
          </section>
        ) : null}

        {showsSteps(view) ? (
          <section className={s.section} aria-labelledby="steps-title">
            <h2 id="steps-title" className={s["section-title"]}>
              진행 단계
            </h2>
            <ol className={t.steps} role="list">
              {view.steps.map((step) => {
                const detail = fanStepDetail(step, view);
                return (
                  <li key={step.key} className={t[step.state]} aria-current={step.state === "current" ? "step" : undefined}>
                    <span className={t.mark} aria-hidden="true">
                      {step.state === "done" ? <Check /> : null}
                    </span>
                    <div>
                      <h3 className={t.label}>
                        {FAN_STEP_LABEL[step.key]}
                        {step.state === "current" ? <span className={s.pill}>지금</span> : null}
                        {step.state === "done" ? <span className={s["sr-only"]}>완료</span> : null}
                        {step.state === "stopped" ? <span className={s["pill-plain"]}>멈춤</span> : null}
                      </h3>
                      {detail ? <p className={s.muted}>{detail}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section className={s.section} aria-labelledby="info-title">
          <h2 id="info-title" className={s["section-title"]}>
            주문 정보
          </h2>
          <dl className={`${s.card} ${s.rows}`}>
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
            {view.fanTrackingNo && !view.canEnterTrackingNo ? (
              <div>
                <dt>내가 보낸 송장번호</dt>
                <dd>{view.fanTrackingNo}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {hasShipped(view) ? (
          <p className={`${s.note} ${s.section}`}>
            크리에이터의 주소를 지키기 위해, 크리에이터에게 보내는 택배의 송장번호는 알려 드리지 않아요. 배송 단계는 이
            화면에서 확인할 수 있어요.
          </p>
        ) : null}
      </main>
    </div>
  );
}
