import {
  MAX_DECRYPTS_PER_BOX,
  printLabelOf,
  type AccessMonthSummary,
  type AddressAccessEntry,
} from "@/entities/address/model/access-log";
import { formatDateTime } from "@/shared/lib/format/datetime";
import s from "./access-log.module.css";

// 크리에이터 — 주소 열람 기록. 주소가 열린 줄이 전부 한 줄씩 보인다(INV-P7). 주소 값은 이 화면에 오지 않는다.
// 거부된 시도와 대표·직원 구분은 운영자 내부 기록에만 있다(2026-10-12 문제집 D12) — 그래서 「누가」 칸도 없다.
// 줄은 전부 주소가 열린 줄이라 「결과」 칸·「열림」 배지도 두지 않는다 — 비고 칸이 몇 번째 출력과 「출력 실패」(돌려받은 줄, INV-P15)를 보인다.
// 시안: docs/design/mockups/site/v11/creator-log.html — 이번 달 숫자 카드 셋 + 안내 판, 그 아래 표(어느 폭에서도 표, 휴대폰은 마지막 칸만 줄바꿈)
// 문구 한계(design-rules 6절): "승인 없이는 저희 시스템이 주소를 열지 않습니다"는 쓰고 "절대 유출되지 않습니다"는 쓰지 않는다.

function Note({ e }: { e: AddressAccessEntry }) {
  const label = printLabelOf(e.printNo, e.released);
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
    <div className={s.root}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            주소 열람 기록<span className="ph-count">{entries.length}</span>
          </h1>
        </div>
        <p className="ph-desc">
          <strong className={`t-strong ${s.strong}`}>승인 없이는 저희 시스템이 주소를 열지 않습니다.</strong> 열린 기록은 전부 여기에 보여요.
        </p>
      </header>

      <section aria-labelledby="sum-h">
        <h2 className={`t-card ${s.sh}`} id="sum-h">
          이번 달 ({monthLabel})
        </h2>
        <div className="stack">
          <dl className={`grid cols-3 keep ${s.nums}`}>
            <div className="card">
              <dt className="t-meta">승인</dt>
              <dd className={s.num}>
                {summary.approvedCount}
                <small>건</small>
              </dd>
            </div>
            <div className="card">
              <dt className="t-meta">주소 열림</dt>
              <dd className={s.num}>
                {summary.openedCount}
                <small>번</small>
              </dd>
            </div>
            <div className="card">
              <dt className="t-meta">재출력</dt>
              <dd className={s.num}>
                {summary.reprintCount}
                <small>번</small>
              </dd>
            </div>
          </dl>
          <div className="card card--soft">
            <img className={s.ico} src="/img/icon-log.png" alt="" aria-hidden="true" width={72} height={72} />
            <p>
              주소는 선물 상자마다 첫 출력과 재출력을 합쳐 최대 {MAX_DECRYPTS_PER_BOX}번까지 열려요. 택배 기사가 상자를 가져가면 남은 횟수가 있어도 그 상자로는 더
              열리지 않아요.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="rec-h">
        <h2 className={`t-card ${s.sh}`} id="rec-h">
          열람 기록
        </h2>
        {entries.length === 0 ? (
          <p className="empty">아직 주소가 열린 적이 없어요. 송장을 출력할 때마다 여기에 남아요.</p>
        ) : (
          <div className="table-wrap pane-wide" tabIndex={0} role="region" aria-label="주소 열람 기록 표">
            <table className="table">
              <caption className="sr-only">주소 열람 기록. 최근 순</caption>
              <thead>
                <tr>
                  <th scope="col">시각</th>
                  <th scope="col">주문번호</th>
                  <th scope="col">비고</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={`${i}-${e.orderNo}-${e.at}`}>
                    <td className={s.nw}>{formatDateTime(e.at)}</td>
                    <td className={s.nw}>{e.orderNo}</td>
                    <td>
                      <Note e={e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
