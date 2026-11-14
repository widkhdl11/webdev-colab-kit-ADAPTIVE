import type { AdminOfficeAddress } from "@/entities/order/api/read-office-address";
import { OfficeAddressForm } from "@/features/admin-office-address-edit/ui/office-address-form";
import a from "@/shared/ui/admin.module.css";

// 관리자 「팬꾹 주소」 본문 (admin-console INV-K19). 요금표 화면(widgets/admin-pricing)과 같은 틀 —
// 대표만 고칠 수 있고 직원에게는 값만 보인다. 바꾼 기록은 고치거나 지울 수 없다(DB 가 막는다).

const stamp = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "2026-11-14 09:30" (서울 시각) */
function formatStamp(iso: string): string {
  const parts = stamp.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.01" />
    </svg>
  );
}

type Props = { data: AdminOfficeAddress; access: "staff" | "owner" };

export function OfficeAddressPanel({ data, access }: Props) {
  const owner = access === "owner";
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>팬꾹 주소</h1>
          <p>팬과 크리에이터가 상자를 보내는 주소예요. 끝에 상자마다 다른 6자리가 붙어요. 주소는 대표만 고칠 수 있어요.</p>
        </div>
      </div>

      <div className={a.stack}>
        {!owner && (
          <div className={a.note}>
            <InfoIcon />
            <p>
              <b>직원 계정이에요.</b> 주소는 읽기만 돼요.
            </p>
          </div>
        )}
        <div className={a.note}>
          <InfoIcon />
          <p>
            <b>저장하면 바로 모든 화면에 바뀐 주소가 보여요.</b> 이미 주소를 받은 팬에게도 새 주소가 보이고, 옛 주소로 이미 보낸 상자는 옛 주소로 가요.
          </p>
        </div>

        <OfficeAddressForm address={data.address} editable={owner} />

        <section aria-labelledby="h-office-address-log">
          <div className={a.sectionH}>
            <h2 id="h-office-address-log">주소 바꾼 기록</h2>
            <span>최근 20건 · 고치거나 지울 수 없어요</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 720 }}>
              <caption className="sr-only">팬꾹 주소 변경 기록</caption>
              <thead>
                <tr>
                  <th scope="col">시각</th>
                  <th scope="col">대표</th>
                  <th scope="col">전</th>
                  <th scope="col">후</th>
                </tr>
              </thead>
              <tbody>
                {data.changes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={a.empty}>
                      아직 바꾼 기록이 없어요.
                    </td>
                  </tr>
                ) : (
                  data.changes.map((c, i) => (
                    <tr key={`${c.at}-${i}`}>
                      <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(c.at)}</td>
                      <td className={a.nowrap}>{c.byNickname}</td>
                      <td style={{ overflowWrap: "anywhere" }}>{c.before}</td>
                      <td style={{ overflowWrap: "anywhere" }}>
                        <b>{c.after}</b>
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
