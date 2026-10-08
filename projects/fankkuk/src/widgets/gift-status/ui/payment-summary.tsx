import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import type { GiftDifference } from "@/entities/payment/model/difference-rows";
import { paymentLines, type GiftPayment } from "@/entities/payment/model/gift-payment";
import { formatDate } from "@/shared/lib/format/datetime";
import s from "./gift-status.module.css";

// 결제 내역 — 시안 docs/design/mockups/site/v4/gift.html 의 .pay (상자 줄 · 합계). 주문 정보 회색 판 안에 붙는다(회색 판은 하나).
// 금액은 결제할 때 저장한 값만 보인다(payment INV-M14) — 지금 요금표로 다시 계산하지 않는다.
// 차액은 상자별 차액 결제 줄(my_difference_payments)에서 결제를 마친 것만, 환불은 서버가 정한 금액과 상태 그대로.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

type Props = { payment: GiftPayment; differences: readonly GiftDifference[] };

export function PaymentSummary({ payment, differences }: Props) {
  const lines = paymentLines(payment.boxes);
  const paidDifferences = differences.filter((d) => d.state === "paid");
  return (
    <section className={s.pay} aria-labelledby="pay-title">
      <h3 id="pay-title">결제 내역</h3>
      {lines.map((l) => (
        <div key={`${l.tier}-${l.unitKrw}-${l.missing}`} className={s["sum-line"]}>
          <span>
            {PARCEL_TIER_GUIDE[l.tier].name} 상자{" "}
            <small>
              {won(l.unitKrw)} × {l.count}
              {l.missing ? " · 도착하지 않음" : ""}
            </small>
          </span>
          <span className={s.amt}>{won(l.unitKrw * l.count)}</span>
        </div>
      ))}
      <div className={s["sum-total"]}>
        <span>합계</span>
        <span className={s.big}>{won(payment.paidKrw)}</span>
      </div>
      <p className={s["pay-note"]}>{formatDate(payment.paidAt)}에 결제했어요.</p>

      {paidDifferences.length > 0 ? (
        <div className={s["pay-extra"]}>
          {paidDifferences.map((d) => (
            <div key={d.boxId} className={s["sum-line"]}>
              <span>
                차액 · 상자 {d.boxSeq} <small>결제 완료</small>
              </span>
              <span className={s.amt}>{won(d.amountKrw)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {payment.refunds.length > 0 ? (
        <div className={s["pay-extra"]}>
          {payment.refunds.map((r, i) => (
            <div key={`${r.at}-${i}`} className={s["sum-line"]}>
              <span>
                {r.state === "done" ? "환불 완료" : "환불 처리 중"} <small>{formatDate(r.at)}</small>
              </span>
              <span className={s.amt}>{won(r.amountKrw)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <p className={s["pay-note"]}>도착한 상자를 재어 보니 구간이 더 크면, 차액만 따로 결제해요.</p>
    </section>
  );
}
