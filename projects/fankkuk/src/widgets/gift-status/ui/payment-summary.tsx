import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import type { GiftDifference } from "@/entities/payment/model/difference-rows";
import { paymentLines, type GiftPayment } from "@/entities/payment/model/gift-payment";
import { formatDate } from "@/shared/lib/format/datetime";
import s from "./gift-status.module.css";

// 결제 내역 — 시안 docs/design/mockups/site/v35-part1/gift-detail.html 의 「결제」 카드 안(큰 금액 아래 상자 줄 · 검수 포함 · 결제한 날). 카드와 큰 금액은 부르는 쪽이 그린다.
// 금액은 결제할 때 저장한 값만 보인다(payment INV-M14) — 지금 요금표로 다시 계산하지 않는다.
// 차액은 상자별 차액 결제 줄(my_difference_payments)에서 결제를 마친 것만, 환불은 서버가 정한 금액과 상태 그대로.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

type Props = { payment: GiftPayment; differences: readonly GiftDifference[] };

export function PaymentSummary({ payment, differences }: Props) {
  const lines = paymentLines(payment.boxes);
  const paidDifferences = differences.filter((d) => d.state === "paid");
  return (
    <>
      <dl className={s.kv}>
        {lines.map((l) => (
          <div key={`${l.tier}-${l.unitKrw}-${l.missing}`}>
            <dt>
              {PARCEL_TIER_GUIDE[l.tier].name} 상자 {won(l.unitKrw)} × {l.count}
              {l.missing ? " · 도착하지 않음" : ""}
            </dt>
            <dd>{won(l.unitKrw * l.count)}</dd>
          </div>
        ))}
        {paidDifferences.map((d) => (
          <div key={d.boxId}>
            <dt>차액 · 상자 {d.boxSeq} · 결제 완료</dt>
            <dd>{won(d.amountKrw)}</dd>
          </div>
        ))}
        {payment.refunds.map((r, i) => (
          <div key={`${r.at}-${i}`}>
            <dt>
              {r.state === "done" ? "환불 완료" : "환불 처리 중"} · {formatDate(r.at)}
            </dt>
            <dd>{won(r.amountKrw)}</dd>
          </div>
        ))}
      </dl>
      <p className={s.ok}>
        <span className="tag">
          <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          검수 포함
        </span>
      </p>
      <p className={s.payNote}>
        {formatDate(payment.paidAt)}에 결제했어요.
        <br />
        도착한 상자를 재어 보니 구간이 더 크면, 차액만 따로 결제해요.
      </p>
    </>
  );
}
