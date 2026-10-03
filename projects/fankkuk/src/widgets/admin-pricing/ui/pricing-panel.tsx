import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { PRICE_FIELD_NAME, type PriceChange } from "@/entities/payment/model/price-change";
import type { PriceTable } from "@/entities/payment/model/price-table";
import { formatWon } from "@/features/admin-pricing-edit/model/price-input";
import { PricingForm } from "@/features/admin-pricing-edit/ui/pricing-form";
import a from "@/shared/ui/admin.module.css";

// 관리자 「요금표」 본문 (admin-console INV-K2·K4·K5, 시안 admin/pricing.html).
// 대표만 고칠 수 있다 — 직원에게는 입력칸·버튼 없이 값만 보인다. 바꾼 기록은 고치거나 지울 수 없다(DB 가 막는다).

const stamp = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "10-03 09:30" (서울 시각) */
function formatStamp(iso: string): string {
  const parts = stamp.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.01" />
    </svg>
  );
}

type Props = { table: PriceTable; changes: readonly PriceChange[]; access: "staff" | "owner" };

export function PricingPanel({ table, changes, access }: Props) {
  const owner = access === "owner";
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>요금표</h1>
          <p>구간별로 받는 값과 원가를 정해요. 요금은 대표만 고칠 수 있어요.</p>
        </div>
      </div>

      <div className={a.stack}>
        {!owner && (
          <div className={a.note}>
            <InfoIcon />
            <p>
              <b>직원 계정이에요.</b> 요금은 읽기만 돼요.
            </p>
          </div>
        )}
        <div className={`${a.note} ${a.noteOk}`}>
          <InfoIcon />
          <p>
            <b>새 주문부터 적용돼요.</b> 이미 등록했거나 결제한 주문은 등록할 때의 요금 그대로예요.
          </p>
        </div>

        <PricingForm table={table} editable={owner} />

        <p className={a.hint}>
          구간 기준(크기·무게)은 이 화면에서 바꾸지 않아요. 크기와 무게 중 큰 쪽으로 구간을 정하고, 대형을 넘으면 받지 않아요. 역조공 요금은 받는 값 − 검수비로 늘 자동 계산해요.
        </p>

        <section aria-labelledby="h-price-log">
          <div className={a.sectionH}>
            <h2 id="h-price-log">요금 바꾼 기록</h2>
            <span>고치거나 지울 수 없어요</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 640 }}>
              <caption className="sr-only">요금 변경 기록</caption>
              <thead>
                <tr>
                  <th scope="col">시각</th>
                  <th scope="col">대표</th>
                  <th scope="col">구간</th>
                  <th scope="col">칸</th>
                  <th scope="col" className={a.num}>
                    전
                  </th>
                  <th scope="col" className={a.num}>
                    후
                  </th>
                </tr>
              </thead>
              <tbody>
                {changes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={a.empty}>
                      아직 바꾼 기록이 없어요.
                    </td>
                  </tr>
                ) : (
                  changes.map((c, i) => (
                    <tr key={`${c.at}-${c.tier}-${c.field}-${i}`}>
                      <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(c.at)}</td>
                      <td>{c.byNickname}</td>
                      <td>{PARCEL_TIER_GUIDE[c.tier].name}</td>
                      <td>{PRICE_FIELD_NAME[c.field]}</td>
                      <td className={`${a.num} ${a.mono}`}>{formatWon(c.beforeKrw)}원</td>
                      <td className={`${a.num} ${a.mono}`}>
                        <b>{formatWon(c.afterKrw)}원</b>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
