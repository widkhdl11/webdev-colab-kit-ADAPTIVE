import { ADMIN_ACCESS_LOG_LIMIT, type AdminAccessEntry } from "@/entities/address/api/admin-access-log";
import { printLabelOf } from "@/entities/address/model/access-log";
import { ACCESS_DENY_TEXT, ACCESS_REQUESTER_TEXT, RETURN_ACCESS_DENY_TEXT, REVGIFT_ACCESS_DENY_TEXT } from "@/entities/address/ui/access-log-text";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「주소 열람 기록」 — 운영자만 보는 내부 기록 (address-protection INV-P7, 2026-10-12 문제집 D12).
// 크리에이터·팬 화면에는 주소가 열린 줄과 지운 줄만 간다. 거부된 시도(직원이 누른 송장 출력 포함)와 대표·직원 구분은 여기에만 있다.
// 사람은 닉네임으로만 보인다(admin-console INV-K8). 주소·운송장 번호는 이 화면에 없다.

function noteOf(e: AdminAccessEntry): string {
  if (e.result.kind === "opened") return printLabelOf(e.result.printNo, e.result.released).text;
  const special = e.target === "revgift" ? REVGIFT_ACCESS_DENY_TEXT : e.target === "return" ? RETURN_ACCESS_DENY_TEXT : {};
  return special[e.result.reason] ?? ACCESS_DENY_TEXT[e.result.reason];
}

/** 「선물」 칸 — 반송 송장 줄(INV-P18)은 팬 선물·역조공 어느 쪽이든 「반송」 */
const TARGET_TEXT: Record<AdminAccessEntry["target"], string> = { gift: "팬 선물", revgift: "역조공", return: "반송" };

function whoOf(e: AdminAccessEntry): string {
  const role = ACCESS_REQUESTER_TEXT[e.requester];
  return e.requesterNickname ? `${role} · ${e.requesterNickname}` : role;
}

export function AccessLogPanel({ entries }: { entries: readonly AdminAccessEntry[] }) {
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>주소 열람 기록</h1>
          <p>
            송장 출력으로 주소를 연 기록과 거절된 시도를 최근 순으로 {ADMIN_ACCESS_LOG_LIMIT}줄까지 보여요. 운영자만 보는 내부 기록이에요 — 크리에이터와 팬에게는
            주소가 열린 줄과 지운 줄만 보여요.
          </p>
        </div>
      </div>
      <div className={a.tblWrap}>
        <table className={a.tbl} style={{ minWidth: 820 }}>
          <caption className="sr-only">주소 열람 내부 기록. 최근 순</caption>
          <thead>
            <tr>
              <th scope="col">시각</th>
              <th scope="col">선물</th>
              <th scope="col">주문번호</th>
              <th scope="col">누가</th>
              <th scope="col">결과</th>
              <th scope="col">비고</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className={a.empty}>
                  아직 기록이 없어요.
                </td>
              </tr>
            ) : (
              entries.map((e, i) => (
                <tr key={`${i}-${e.orderNo}-${e.at}`}>
                  <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(e.at)}</td>
                  <td>{TARGET_TEXT[e.target]}</td>
                  <td className={`${a.mono} ${a.nowrap}`}>
                    <strong>{e.orderNo}</strong>
                  </td>
                  <td>{whoOf(e)}</td>
                  <td>{e.result.kind === "opened" ? <span className={`${a.tag} ${a.tagInfo}`}>열림</span> : <span className={`${a.tag} ${a.tagDanger}`}>거절</span>}</td>
                  <td>{noteOf(e)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
