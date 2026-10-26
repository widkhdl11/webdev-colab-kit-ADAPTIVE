import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import type { GiftDifference } from "@/entities/payment/model/difference-rows";
import { paymentLines, type GiftPayment } from "@/entities/payment/model/gift-payment";
import { formatDate } from "@/shared/lib/format/datetime";
import { statusTagClass } from "@/shared/ui/status-tone";
import s from "./gift-status.module.css";

// 결제 내역 — 선물 정보 카드 안 「결제」 묶음(시안 v41-user-fixes/s/detail-after.html .ginfo .grp, design-rules 33절):
// 상자별 금액 줄 → 결제 금액(24) → 추가 결제 꼬리표 → 검수 포함 → 결제한 날 문장. 묶음 제목·취소하기는 부르는 쪽이 그린다.
// 금액은 결제할 때 저장한 값만 보인다(payment INV-M14) — 지금 요금표로 다시 계산하지 않는다.
// 차액은 상자별 차액 결제 줄(my_difference_payments)에서 결제를 마친 것만, 환불은 서버가 정한 금액과 상태 그대로.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

type Props = {
  payment: GiftPayment;
  differences: readonly GiftDifference[];
  /** 진행 중 주문인가 — 차액 안내 문장은 아직 상자를 잴 수 있는 진행 중에만 */
  inProgress?: boolean;
  /** 아직 내지 않은 차액의 합 — 결제는 맨 위 칸에서만 한다(INV-J13). 0 이면 꼬리표 없음 */
  dueKrw?: number;
};

export function PaymentSummary({ payment, differences, dueKrw = 0, inProgress = false }: Props) {
  const lines = paymentLines(payment.boxes);
  const paidDifferences = differences.filter((d) => d.state === "paid");
  return (
    <>
      <dl className={s.kv}>
        {lines.map((l) => (
          <div key={`${l.tier}-${l.unitKrw}-${l.missing}`}>
            <dt>
              {PARCEL_TIER_GUIDE[l.tier].name} 상자 {won(l.unitKrw)} × {l.count}
              {l.missing ? " · 미도착" : ""}
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
      <p className={s.paytot}>
        <span>결제 금액</span>
        <b>
          {payment.paidKrw.toLocaleString("ko-KR")}
          <small>원</small>
        </b>
      </p>
      {dueKrw > 0 ? <span className={statusTagClass("warn", s.duetag)}>추가 결제 {won(dueKrw)}</span> : null}
      <p className={s.ok}>
        <span className="tag">
          <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          검수 포함
        </span>
      </p>
      <p className={s.payNote}>
        결제일: {formatDate(payment.paidAt)}
        {inProgress ? (
          <>
            <br />
            실측 결과가 선택한 요금 구간을 초과하면 차액이 청구됩니다.
          </>
        ) : null}
      </p>
    </>
  );
}
