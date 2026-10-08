import { printLabelOf } from "@/entities/address/model/access-log";
import { ACCESS_DENY_TEXT } from "@/entities/address/ui/access-log-text";
import {
  REVGIFT_MAX_DECRYPTS,
  type FanAccessEntry,
  type FanAccessRequester,
  type RevgiftDeleteOutcome,
  type RevgiftDenyReason,
} from "@/entities/revgift/model/fan-access-log";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { statusTagClass } from "@/shared/ui/status-tone";
import s from "./revgift-access-log.module.css";

// 받은 역조공 상세 — 내 주소 열람 기록(reverse-gift INV-R16). 연 줄·거부 줄·지운 줄이 한 줄씩 보인다.
// 크리에이터 열람 기록 화면(widgets/access-log)과 같은 표·문구를 쓴다. 주소 값·운송장 번호는 이 화면에 오지 않는다.
// 문구 한계(design-rules 6절): 주소는 「송장을 출력할 때만」 열린다고 쓰고 「절대 유출되지 않습니다」는 쓰지 않는다.

// 크리에이터 화면의 사유 문구를 그대로 쓰되, 팬 선물의 「승인 서명」·「서명한 주문」에 기대는 둘은 역조공에서 뜻이 달라 바꾼다 —
// 역조공의 no_valid_approval 은 받기로 넣은 주소가 없을 때, order_mismatch 는 봉인 속 주문번호가 이 선물과 다를 때다(INV-R7 a·b).
// 「대표」는 크리에이터에게는 자기 계정 이야기지만 팬에게는 누구 대표인지 모호해 「팬꾹 대표」로 쓴다.
const DENY_TEXT: Record<RevgiftDenyReason, string> = {
  ...ACCESS_DENY_TEXT,
  not_owner: "팬꾹 대표 계정이 아니라 열리지 않았어요",
  no_valid_approval: "받기로 하며 입력한 주소가 없어 열리지 않았어요",
  order_mismatch: "다른 선물의 주소라 열리지 않았어요",
};

const DELETE_TEXT: Record<RevgiftDeleteOutcome, string> = {
  shipped: "출고되어 주소를 지웠어요",
  returned: "반송되어 주소를 지웠어요",
  cancelled: "취소되어 주소를 지웠어요",
};

const REQUESTER_TEXT: Record<FanAccessRequester, string> = { owner: "팬꾹 대표 계정", other: "팬꾹 대표가 아닌 계정" };

function Who({ e }: { e: FanAccessEntry }) {
  return <>{e.kind === "deleted" ? "없음" : REQUESTER_TEXT[e.requester]}</>;
}

function ResultTag({ e }: { e: FanAccessEntry }) {
  if (e.kind === "opened") return <span className={statusTagClass("info")}>열림</span>;
  if (e.kind === "denied") return <span className={statusTagClass("danger")}>거부</span>;
  return <span className={statusTagClass("plain")}>지움</span>;
}

function Note({ e }: { e: FanAccessEntry }) {
  if (e.kind === "denied") return <>{DENY_TEXT[e.reason]}</>;
  if (e.kind === "deleted") return <>{DELETE_TEXT[e.outcome]}</>;
  const label = printLabelOf(e.printNo, e.released);
  return label.reprint ? <span className="tag">{label.text}</span> : <>{label.text}</>;
}

/**
 * entries 가 null 이면 기록을 읽지 못한 것 — 빈 목록(열린 적 없음)과 구분해 보여 준다.
 * finished: 더 출력할 일이 없는 몫(받지 않음·기한 지남·출고·반송·취소) — 「출력할 때마다 남는다」는 안내를 하지 않는다.
 */
export function RevgiftAccessLog({ entries, finished }: { entries: readonly FanAccessEntry[] | null; finished: boolean }) {
  return (
    <section className={s.panel} aria-labelledby="rv-log-title">
      <h2 id="rv-log-title">내 주소 열람 기록</h2>
      <p className={`sub ${s.lead}`}>
        내 주소는 송장을 출력할 때만 열리고, 재출력을 합쳐 최대 {REVGIFT_MAX_DECRYPTS}번까지예요. 출고·반송·취소가 되면 주소를 지워요. 열린 기록은 전부 여기에 보여요.
      </p>
      {entries === null ? (
        <p className={`sub ${s.empty}`} role="status">
          열람 기록을 지금 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.
        </p>
      ) : entries.length === 0 ? (
        <p className={`sub ${s.empty}`}>
          {finished ? "이 선물에서는 주소가 열린 적이 없어요." : "아직 주소가 열린 적이 없어요. 송장을 출력할 때마다 여기에 남아요."}
        </p>
      ) : (
        <>
          <table className={s["log-table"]}>
            <caption className="sr-only">내 주소 열람 기록. 최근 순</caption>
            <thead>
              <tr>
                <th scope="col">시각</th>
                <th scope="col">누가</th>
                <th scope="col">결과</th>
                <th scope="col">비고</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${i}-${e.at}`}>
                  <td className={s.nw}>{formatDateTime(e.at)}</td>
                  <td>
                    <Who e={e} />
                  </td>
                  <td>
                    <ResultTag e={e} />
                  </td>
                  <td>
                    <Note e={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className={s["log-list"]} aria-label="내 주소 열람 기록">
            {entries.map((e, i) => (
              <li key={`${i}-${e.at}`} className={s.lrow}>
                <div className={s.top}>
                  <strong>{formatDateTime(e.at)}</strong>
                  <ResultTag e={e} />
                </div>
                {e.kind === "deleted" ? null : (
                  <p className="sub">
                    <Who e={e} />
                  </p>
                )}
                <p>
                  <Note e={e} />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
