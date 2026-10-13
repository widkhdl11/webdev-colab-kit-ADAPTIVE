import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import type { GiftDifference } from "@/entities/payment/model/difference-rows";
import { paymentLines, type GiftPayment } from "@/entities/payment/model/gift-payment";
import { formatDate } from "@/shared/lib/format/datetime";
import s from "./gift-status.module.css";

// 결제 내역 — 시안 docs/design/mockups/site/v11/gift.html 의 「결제 내역」 카드(상자 줄 · 합계 · 검수 포함). 주문 정보 카드 옆 칸이다.
// 금액은 결제할 때 저장한 값만 보인다(payment INV-M14) — 지금 요금표로 다시 계산하지 않는다.
// 차액은 상자별 차액 결제 줄(my_difference_payments)에서 결제를 마친 것만, 환불은 서버가 정한 금액과 상태 그대로.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

type Props = { payment: GiftPayment; differences: readonly GiftDifference[] };

export function PaymentSummary({ payment, differences }: Props) {
  const lines = paymentLines(payment.boxes);
  const paidDifferences = differences.filter((d) => d.state === "paid");
  return (
    <section className="card" aria-labelledby="pay-title">
      <h2 className="t-card" id="pay-title">
        결제 내역
      </h2>
      <div className={`lines ${s.lines}`}>
        {lines.map((l) => (
          <div key={`${l.tier}-${l.unitKrw}-${l.missing}`}>
            <span>
              {PARCEL_TIER_GUIDE[l.tier].name} 상자{" "}
              <span className="t-meta">
                {won(l.unitKrw)} × {l.count}
                {l.missing ? " · 도착하지 않음" : ""}
              </span>
            </span>
            <span className="amt">{won(l.unitKrw * l.count)}</span>
          </div>
        ))}
        <div className="total">
          <span className="t-strong">합계</span>
          <span className="amt">{won(payment.paidKrw)}</span>
        </div>
      </div>
      <p className={s["tag-line"]}>
        <span className="tag">
          <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          검수 포함
        </span>
      </p>
      <p className={`t-meta ${s["tag-line"]}`}>{formatDate(payment.paidAt)}에 결제했어요.</p>

      {paidDifferences.length > 0 ? (
        <div className={`lines ${s["pay-extra"]}`}>
          {paidDifferences.map((d) => (
            <div key={d.boxId}>
              <span>
                차액 · 상자 {d.boxSeq} <span className="t-meta">결제 완료</span>
              </span>
              <span className="amt">{won(d.amountKrw)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {payment.refunds.length > 0 ? (
        <div className={`lines ${s["pay-extra"]}`}>
          {payment.refunds.map((r, i) => (
            <div key={`${r.at}-${i}`}>
              <span>
                {r.state === "done" ? "환불 완료" : "환불 처리 중"} <span className="t-meta">{formatDate(r.at)}</span>
              </span>
              <span className="amt">{won(r.amountKrw)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <p className={`t-meta ${s.more4}`}>도착한 상자를 재어 보니 구간이 더 크면, 차액만 따로 결제해요.</p>
    </section>
  );
}
