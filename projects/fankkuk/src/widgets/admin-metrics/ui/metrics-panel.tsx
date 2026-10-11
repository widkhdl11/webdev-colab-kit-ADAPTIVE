import type { MetricCell, MetricsView } from "@/entities/metrics/model/metrics-view";
import a from "@/shared/ui/admin.module.css";

// 관리자 「측정」 (metrics INV-Q1~Q5). 운영자 틀 안에서만 그려진다 — 운영자가 아니면 그 전에 404 다.
// 칸은 비율과 분자·분모뿐이다(INV-Q2). 누가 몇 번 보냈는지, 어느 크리에이터인지는 이 화면에 없다.
// 표 모양은 다른 관리자 화면(자동 처리 현황·요금표)과 같다. 계산·문구는 entities/metrics 가 정하고 여기서는 그리기만 한다.

function Cell({ cell }: { cell: MetricCell }) {
  return (
    <td className={a.num}>
      <strong>{cell.rate}</strong>
      <br />
      <span className={`${a.sub} ${a.mono}`}>{cell.count}</span>
    </td>
  );
}

export function MetricsPanel({ view }: { view: MetricsView }) {
  const periodHeads = view.periods.map((p) => (
    <th key={p.key} scope="col" className={a.num}>
      {p.label}
    </th>
  ));
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>측정</h1>
          <p>선물 기능이 팬을 다시 보내게 하는지 봐요. 비율과 건수만 있고, 누가 몇 번 보냈는지는 보이지 않아요.</p>
        </div>
      </div>

      <div className={a.stack}>
        <p className={a.hint}>
          칸마다 위는 비율, 아래는 「센 수 / 전체 수」예요. 전체 수가 0 이면 「아직 셀 수 없어요」로 보여요. 달은 한국 시간 기준이에요.
        </p>

        <section aria-labelledby="metrics-gifts">
          <div className={a.sectionH}>
            <h2 id="metrics-gifts">선물·답장</h2>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 760 }}>
              <caption className="sr-only">선물·답장 지표 — 전체와 최근 3개월</caption>
              <thead>
                <tr>
                  <th scope="col">지표</th>
                  {periodHeads}
                </tr>
              </thead>
              <tbody>
                {view.ratios.map((r) => (
                  <tr key={r.metric}>
                    <th scope="row">
                      {r.label}
                      <br />
                      <span className={a.hint}>{r.hint}</span>
                    </th>
                    {r.cells.map((c) => (
                      <Cell key={c.period} cell={c} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="metrics-signup">
          <div className={a.sectionH}>
            <h2 id="metrics-signup">가입 경로</h2>
            <span>「어디서 알게 되셨나요」 답</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 760 }}>
              <caption className="sr-only">가입 경로 — 전체와 최근 3개월</caption>
              <thead>
                <tr>
                  <th scope="col">답</th>
                  {periodHeads}
                </tr>
              </thead>
              <tbody>
                {view.sources.map((s) => (
                  <tr key={s.bucket}>
                    <th scope="row">{s.label}</th>
                    {s.cells.map((c) => (
                      <Cell key={c.period} cell={c} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {view.utm.map((u) => (
          <section key={u.kind} aria-labelledby={`metrics-${u.kind}`}>
            <div className={a.sectionH}>
              <h2 id={`metrics-${u.kind}`}>공유 링크 {u.label}</h2>
              <span>전체 기간 · 가입한 계정 기준</span>
            </div>
            <div className={a.tblWrap}>
              <table className={a.tbl}>
                <caption className="sr-only">공유 링크 {u.label} 값별 가입</caption>
                <thead>
                  <tr>
                    <th scope="col">값</th>
                    <th scope="col" className={a.num}>
                      비율
                    </th>
                    <th scope="col" className={a.num}>
                      가입 / 전체 가입
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {u.items.length === 0 ? (
                    <tr>
                      <td colSpan={3} className={a.empty}>
                        아직 이 값으로 들어온 가입이 없어요.
                      </td>
                    </tr>
                  ) : (
                    u.items.map((i) => (
                      <tr key={i.value}>
                        <td className={a.mono}>{i.value}</td>
                        <td className={a.num}>{i.rate}</td>
                        <td className={`${a.num} ${a.mono}`}>{i.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
