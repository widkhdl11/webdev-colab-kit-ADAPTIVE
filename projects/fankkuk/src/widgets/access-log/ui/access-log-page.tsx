import {
  MAX_DECRYPTS_PER_BOX,
  printLabelOf,
  type AccessMonthSummary,
  type AddressAccessEntry,
} from "@/entities/address/model/access-log";
import { PROMISE } from "@/shared/config/site-copy";
import { formatDate, formatTimeKo } from "@/shared/lib/format/datetime";
import s from "./access-log.module.css";

// 크리에이터 — 주소 열람 기록. 주소가 열린 줄이 전부 한 줄씩 보인다(INV-P7). 주소 값은 이 화면에 오지 않는다.
// 거부된 시도와 대표·직원 구분은 운영자 내부 기록에만 있다(2026-10-12 문제집 D12) — 그래서 「누가」 칸도 없다.
// 줄은 전부 주소가 열린 줄이라 「결과」 칸·「열림」 배지도 두지 않는다 — 비고 칸이 몇 번째 출력과 「출력 실패」(돌려받은 줄, INV-P15)를 보인다.
// 시안: docs/design/mockups/site/v37-part2/log.html (design-rules 23-3절) — 「주소 열림 N번」 판과 「최대 3번」 회색 칸을 2:1, 표는 880 폭에 날짜별로 묶은 촘촘한 줄.
// 문구 한계(design-rules 6절): "승인 없이는 저희 시스템이 주소를 열지 않습니다"는 쓰고 "절대 유출되지 않습니다"는 쓰지 않는다.

function Note({ e }: { e: AddressAccessEntry }) {
  const label = printLabelOf(e.printNo, e.released);
  return label.reprint ? <span className="tag">{label.text}</span> : <>{label.text}</>;
}

type Day = { day: string; entries: AddressAccessEntry[] };

/** 최근 순 그대로 서울 날짜마다 묶는다 */
function byDay(entries: readonly AddressAccessEntry[]): Day[] {
  const out: Day[] = [];
  for (const e of entries) {
    const day = formatDate(e.at);
    const last = out[out.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else out.push({ day, entries: [e] });
  }
  return out;
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
    <div className={`v34 ${s.root}`}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            주소 열람 기록<span className="ph-count">{entries.length}건</span>
          </h1>
        </div>
        <p className="ph-desc">
          <strong className={`t-strong ${s.strong}`}>주소는 승인·검수 후 송장 출력에만 사용합니다.</strong> 주소 열람 시각과 출력 내역을 확인할 수 있습니다. {PROMISE.addressFan}
        </p>
      </header>

      <div className={s.top}>
        <section className={`card ${s.num}`} aria-labelledby="sum-h">
          <img className={s.peek} src="/images/home/promise-lock.webp" alt="" width={96} height={96} />
          <h2 className={s.month} id="sum-h">
            이번 달 ({monthLabel})
          </h2>
          <dl className={s.nums}>
            <div className={s.main}>
              <dt>주소 열람</dt>
              <dd className="num-big">
                {summary.openedCount}
                <small>회</small>
              </dd>
            </div>
            <div className={s.subs}>
              <div>
                <dt>승인</dt>
                <dd>{summary.approvedCount}건</dd>
              </div>
              <div>
                <dt>재출력</dt>
                <dd>{summary.reprintCount}회</dd>
              </div>
            </div>
          </dl>
        </section>
        <div className={s.rule}>
          <p>
            주소 열람은 상자별 첫 출력·재출력을 합쳐 최대 {MAX_DECRYPTS_PER_BOX}회 가능합니다. 택배사 연동 후에는 집하가 확인되면 남은 횟수와 관계없이 추가 열람이 제한됩니다.
          </p>
        </div>
      </div>

      <section className={s.rec} aria-labelledby="rec-h">
        <h2 className={s.sh} id="rec-h">
          열람 기록
        </h2>
        {entries.length === 0 ? (
          <p className="empty">주소 열람 기록이 없습니다. 송장 출력 시 기록됩니다.</p>
        ) : (
          <div className={s.wrap} tabIndex={0} role="region" aria-label="주소 열람 기록 표">
            <table className={s.table}>
              <caption className="sr-only">주소 열람 기록. 최근 순</caption>
              <thead>
                <tr>
                  <th scope="col">시각</th>
                  <th scope="col">주문번호</th>
                  <th scope="col">비고</th>
                </tr>
              </thead>
              {byDay(entries).map((g) => (
                <tbody key={g.day}>
                  <tr className={s.day} data-day="">
                    <th scope="rowgroup" colSpan={3}>
                      {g.day}
                    </th>
                  </tr>
                  {g.entries.map((e, i) => (
                    <tr key={`${i}-${e.orderNo}-${e.at}`}>
                      <td className={s.n}>{formatTimeKo(e.at)}</td>
                      <td className={s.n}>{e.orderNo}</td>
                      <td>
                        <Note e={e} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
