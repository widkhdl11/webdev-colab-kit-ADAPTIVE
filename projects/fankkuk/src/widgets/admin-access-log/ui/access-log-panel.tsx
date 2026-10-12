import type { AdminAccessEntry } from "@/entities/address/api/admin-access-log";
import { printLabelOf, type AccessDenyReason } from "@/entities/address/model/access-log";
import { ACCESS_DENY_TEXT, ACCESS_REQUESTER_TEXT } from "@/entities/address/ui/access-log-text";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「주소 열람 기록」 — 운영자만 보는 내부 기록 (address-protection INV-P7, 2026-10-12 문제집 D12).
// 크리에이터·팬 화면에는 주소가 열린 줄과 지운 줄만 간다. 거부된 시도(직원이 누른 송장 출력 포함)와 대표·직원 구분은 여기에만 있다.
// 사람은 닉네임으로만 보인다(admin-console INV-K8). 주소·운송장 번호는 이 화면에 없다.

// 역조공 몫의 두 사유는 팬 선물과 뜻이 달라 바꿔 쓴다 — 받는 팬 화면이 쓰던 문구와 같다(reverse-gift INV-R7 a·b).
const REVGIFT_DENY_TEXT: Partial<Record<AccessDenyReason, string>> = {
  no_valid_approval: "받기로 하며 입력한 주소가 없어 열리지 않았어요",
  order_mismatch: "다른 선물의 주소라 열리지 않았어요",
};

function noteOf(e: AdminAccessEntry): string {
  if (e.result.kind === "opened") return printLabelOf(e.result.printNo, e.result.released).text;
  return (e.target === "revgift" ? REVGIFT_DENY_TEXT[e.result.reason] : undefined) ?? ACCESS_DENY_TEXT[e.result.reason];
}

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
          <p>송장 출력으로 주소를 연 기록과 거부된 시도를 최근 순으로 200줄까지 보여요. 운영자만 보는 내부 기록이에요.</p>
        </div>
      </div>
      <p className={a.hint} style={{ margin: "0 0 8px" }}>
        크리에이터와 팬에게는 주소가 열린 줄과 지운 줄만 보여요. 거부된 시도와 대표·직원 구분은 이 화면에만 있어요.
      </p>
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
                  <td>{e.target === "gift" ? "팬 선물" : "역조공"}</td>
                  <td className={`${a.mono} ${a.nowrap}`}>
                    <strong>{e.orderNo}</strong>
                  </td>
                  <td>{whoOf(e)}</td>
                  <td>{e.result.kind === "opened" ? <span className={a.tag}>열림</span> : <span className={`${a.tag} ${a.tagInk}`}>거부</span>}</td>
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
