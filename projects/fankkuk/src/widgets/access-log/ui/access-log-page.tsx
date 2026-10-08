import { statusTagClass } from "@/shared/ui/status-tone";
import {
  MAX_DECRYPTS_PER_BOX,
  printLabelOf,
  type AccessMonthSummary,
  type AddressAccessEntry,
} from "@/entities/address/model/access-log";
import { ACCESS_DENY_TEXT, ACCESS_REQUESTER_TEXT } from "@/entities/address/ui/access-log-text";
import { formatDateTime } from "@/shared/lib/format/datetime";
import s from "./access-log.module.css";

// 크리에이터 — 주소 열람 기록. 성공·거부 모두 한 줄씩 보인다(INV-P7). 주소 값은 이 화면에 오지 않는다.
// 시안: docs/design/mockups/site/v4/creator-log.html
// 문구 한계(design-rules 6절): "승인 없이는 저희 시스템이 주소를 열지 않습니다"는 쓰고 "절대 유출되지 않습니다"는 쓰지 않는다.

function ResultTag({ e }: { e: AddressAccessEntry }) {
  return e.result.kind === "opened" ? <span className={statusTagClass("info")}>열림</span> : <span className={statusTagClass("danger")}>거부</span>;
}

function Note({ e }: { e: AddressAccessEntry }) {
  if (e.result.kind === "denied") return <>{ACCESS_DENY_TEXT[e.result.reason]}</>;
  const label = printLabelOf(e.result.printNo, e.result.released);
  return label.reprint ? <span className="tag">{label.text}</span> : <>{label.text}</>;
}

export function AccessLogPage({
  monthLabel,
  summary,
  entries,
}: {
  monthLabel: string;
  summary: AccessMonthSummary;
  entries: readonly AddressAccessEntry[];
}) {
  return (
    <div>
      <div className="panel-title">
        <h2 className="panel-h">주소 열람 기록</h2>
        <p>
          <strong className={s.strong}>승인 없이는 저희 시스템이 주소를 열지 않습니다.</strong> 열린 기록은 전부 여기에 보여요.
        </p>
      </div>

      <section className={s.month} aria-labelledby="sum-h">
        <img className={`asset ${s.ico}`} src="/img/icon-log.png" alt="" aria-hidden="true" width={96} height={96} />
        <div className={s["month-body"]}>
          <h3 id="sum-h" className={s["month-h"]}>
            이번 달 ({monthLabel})
          </h3>
          <dl className={s.nums}>
            <div>
              <dt>승인</dt>
              <dd>
                {summary.approvedCount}
                <small>건</small>
              </dd>
            </div>
            <div>
              <dt>주소 열림</dt>
              <dd>
                {summary.openedCount}
                <small>번</small>
              </dd>
            </div>
            <div>
              <dt>재출력</dt>
              <dd>
                {summary.reprintCount}
                <small>번</small>
              </dd>
            </div>
            <div>
              <dt>거부</dt>
              <dd>
                {summary.deniedCount}
                <small>번</small>
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <p className={`sub ${s.rules}`}>
        주소는 선물 상자마다 첫 출력과 재출력을 합쳐 최대 {MAX_DECRYPTS_PER_BOX}번까지 열려요. 상자가 출고되면 남은 횟수가 있어도 그 상자로는 더 열리지 않아요.
      </p>

      <section className={s.records} aria-label="열람 기록">
        {entries.length === 0 ? (
          <p className={`sub ${s.empty}`}>아직 주소가 열린 적이 없어요. 송장을 출력할 때마다 여기에 남아요.</p>
        ) : (
          <>
            <table className={s["log-table"]}>
              <caption className="sr-only">주소 열람 기록. 최근 순</caption>
              <thead>
                <tr>
                  <th scope="col">시각</th>
                  <th scope="col">주문번호</th>
                  <th scope="col">누가</th>
                  <th scope="col">결과</th>
                  <th scope="col">비고</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={`${i}-${e.orderNo}-${e.at}`}>
                    <td className={s.nw}>{formatDateTime(e.at)}</td>
                    <td className={s.nw}>{e.orderNo}</td>
                    <td>{ACCESS_REQUESTER_TEXT[e.requester]}</td>
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
            <ul className={s["log-list"]} aria-label="주소 열람 기록">
              {entries.map((e, i) => (
                <li key={`${i}-${e.orderNo}-${e.at}`} className={s.lrow}>
                  <div className={s.top}>
                    <strong>{formatDateTime(e.at)}</strong>
                    <ResultTag e={e} />
                  </div>
                  <p className="sub">
                    {e.orderNo} · {ACCESS_REQUESTER_TEXT[e.requester]}
                  </p>
                  <p>
                    <Note e={e} />
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
