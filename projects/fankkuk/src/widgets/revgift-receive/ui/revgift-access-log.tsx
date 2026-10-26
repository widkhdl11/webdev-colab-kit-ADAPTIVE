import { printLabelOf } from "@/entities/address/model/access-log";
import { REVGIFT_MAX_DECRYPTS, type FanAccessEntry, type RevgiftDeleteOutcome } from "@/entities/revgift/model/fan-access-log";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { statusTagClass } from "@/shared/ui/status-tone";
import s from "./revgift-access-log.module.css";

// 받은 역조공 상세 — 내 주소 열람 기록(reverse-gift INV-R16). 연 줄·지운 줄이 한 줄씩 보인다.
// 접은 칸 하나(시안 v35-part1/revgift-detail.html .rv-folds, design-rules 22절) — 머리에 연 횟수, 펼치면 안내·기록. 접혀 있어도 기록은 문서 안에 있다.
// 거부된 시도와 대표·직원 구분은 운영자 내부 기록에만 있어 「누가」 칸이 없다(2026-10-12 문제집 D12).
// 크리에이터 열람 기록 화면(widgets/access-log)과 같은 표를 쓴다. 주소 값·송장번호는 이 화면에 오지 않는다.
// 문구 한계(design-rules 6절): 주소는 「송장을 출력할 때만」 열린다고 쓰고 「절대 유출되지 않습니다」는 쓰지 않는다.

const DELETE_TEXT: Record<RevgiftDeleteOutcome, string> = {
  shipped: "배송용 주소 사본 삭제",
  returned: "반송에 따른 주소 사본 삭제",
  cancelled: "취소에 따른 주소 사본 삭제",
  disposed: "처분에 따른 주소 사본 삭제",
};

function ResultTag({ e }: { e: FanAccessEntry }) {
  if (e.kind === "opened") return <span className={statusTagClass("info")}>열람</span>;
  return <span className={statusTagClass("plain")}>삭제</span>;
}

function Note({ e }: { e: FanAccessEntry }) {
  if (e.kind === "deleted") return <>{DELETE_TEXT[e.outcome]}</>;
  const label = printLabelOf(e.printNo, e.released);
  return label.reprint ? <span className="tag">{label.text}</span> : <>{label.text}</>;
}

/**
 * entries 가 null 이면 기록을 읽지 못한 것 — 빈 목록(열린 적 없음)과 구분해 보여 준다.
 * finished: 더 출력할 일이 없는 몫(받지 않음·기한 지남·출고·반송·취소) — 빈 목록 안내가 「이 선물에서는」 으로 바뀐다.
 */
export function RevgiftAccessLog({ entries, finished }: { entries: readonly FanAccessEntry[] | null; finished: boolean }) {
  return (
    <details className={s.fold}>
      <summary>
        <h2 className={s.title} id="rv-log-title">
          내 주소 열람 기록
        </h2>
        {entries === null ? null : <small>{entries.filter((e) => e.kind === "opened").length}번</small>}
      </summary>
      <div className={s.in}>
      <p className={s.lead}>
        이 선물의 주소는 송장 출력 시에만 확인하며, 재출력 포함 최대 {REVGIFT_MAX_DECRYPTS}회입니다.
        <br />
        배송용 주소 사본은 택배사 집하 확인 시 삭제합니다. 집하 확인이 연동되기 전에는 출고 72시간 후 삭제됩니다. 반송·취소 등으로 종료된 경우에는 해당 처리에 따라 삭제됩니다.
        <br />
        계정 설정에 등록한 주소는 유지됩니다.
      </p>
      {entries === null ? (
        <p className={s.empty} role="status">
          주소 열람 기록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.
        </p>
      ) : entries.length === 0 ? (
        <p className={s.empty}>
          {finished ? "이 선물의 주소 열람 기록이 없습니다." : "주소 열람 기록이 없습니다."}
        </p>
      ) : (
        <>
          <div className={`table-wrap ${s["log-table"]}`}>
            <table className="table">
              <caption className="sr-only">내 주소 열람 기록. 최근 순</caption>
              <thead>
                <tr>
                  <th scope="col">시각</th>
                  <th scope="col">결과</th>
                  <th scope="col">비고</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={`${i}-${e.at}`}>
                    <td className={s.nw}>{formatDateTime(e.at)}</td>
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
          </div>
          <ul className={s["log-list"]} aria-label="내 주소 열람 기록">
            {entries.map((e, i) => (
              <li key={`${i}-${e.at}`} className={s.lrow}>
                <div className={s.top}>
                  <strong>{formatDateTime(e.at)}</strong>
                  <ResultTag e={e} />
                </div>
                <p>
                  <Note e={e} />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      </div>
    </details>
  );
}
