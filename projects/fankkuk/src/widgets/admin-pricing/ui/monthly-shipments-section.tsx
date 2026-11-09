import { formatMonthKo, routeReview, type MonthlyShipments } from "@/entities/payment/model/monthly-shipments";
import a from "@/shared/ui/admin.module.css";

// 월 발송 건수 (admin-console INV-K17, ux pages/admin-pricing.md). 대표·직원 모두 같은 값을 본다(입력칸 없음).
// 끝난 달이 기준 건수 미만으로 기준 달 수만큼 이어지면 「택배 경로 재검토」 경고를 표 위에 띄운다.

/** 표에 보이는 달 수 — 이번 달 포함 */
const SHOWN_MONTHS = 7;

export function MonthlyShipmentsSection({ shipments }: { shipments: MonthlyShipments }) {
  const review = routeReview(shipments);
  const shown = shipments.months.slice(-SHOWN_MONTHS).reverse();
  const judged = new Set(review.judged.map((m) => m.month));
  return (
    <section aria-labelledby="h-monthly-shipments">
      <div className={a.sectionH}>
        <h2 id="h-monthly-shipments">월 발송 건수</h2>
        <span>
          기준 월 {shipments.minMonthly}건 · {shipments.monthsNeeded}달 연속 미만이면 경고
        </span>
      </div>
      {review.warn && (
        <p className={a.note} role="alert" style={{ marginBottom: 8 }}>
          <span className={`${a.tag} ${a.tagWarn}`}>택배 경로 재검토</span>
          <span>
            {review.judged.map((m) => formatMonthKo(m.month)).join(", ")} 발송이 모두 {shipments.minMonthly}건 미만입니다. 기본 경로를 다시 확인해 주세요.
          </span>
        </p>
      )}
      <div className={a.tblWrap}>
        <table className={a.tbl} style={{ minWidth: 360 }}>
          <caption className="sr-only">월 발송 건수</caption>
          <thead>
            <tr>
              <th scope="col">달</th>
              <th scope="col" className={a.num}>
                발송
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.month}>
                <td className={a.nowrap}>
                  {formatMonthKo(m.month)}
                  {m.month === shipments.currentMonth && <span className={a.hint}> (이번 달, 집계 중)</span>}
                </td>
                <td className={`${a.num} ${a.mono}`}>{judged.has(m.month) ? <b>{m.count}건</b> : `${m.count}건`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={a.hint}>출고 확정·반송 확정 기준이고, 우체국으로 보내는 개인접수는 세지 않습니다.</p>
    </section>
  );
}
