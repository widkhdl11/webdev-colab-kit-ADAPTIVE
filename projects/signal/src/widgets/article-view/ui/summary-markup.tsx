import type { SummaryTable } from "@/entities/article";
import styles from "./article-view.module.css";

/**
 * AI 요약 본문 — 칸으로 나뉜 요약을 **글자로만** 그린다 (content-safety INV-D7 · ingestion-ranking INV-S8).
 *
 * 글자 안의 기호는 해석하지 않는다. 한 줄 요약·핵심·표가 따로 저장된 칸이라 해석할 것이 없다 —
 * 요약에 심은 `**`·`[글](주소)` 는 글자 그대로 보인다. HTML 문자열을 만들지 않는다(INV-D3).
 *
 * 순서는 2026-09-23 승인 B안: 한 줄 요약 → 「핵심」 → 표. 상세 화면 재구성 시안(article-detail-v2)이
 * 승인되면 이 순서가 바뀐다.
 */
export function AiSummaryBody({
  oneLine,
  legacyText,
  points,
  table,
}: {
  /** 한 줄 요약. 없으면 옛 요약이다. */
  oneLine: string | null;
  /** 옛 요약 문단(한 줄 요약이 없을 때만 그린다). */
  legacyText: string;
  points: string[];
  table: SummaryTable | null;
}) {
  return (
    <>
      {oneLine !== null ? <p className={styles.summaryLead}>{oneLine}</p> : null}
      {points.length > 0 ? <PointsList points={points} /> : null}
      {/* 옛 요약은 문단 하나 그대로 둔다 — 다시 요약하지 않는다(사용자 결정 2026-09-23). */}
      {oneLine === null ? <p>{legacyText}</p> : null}
      {table !== null ? <SummaryTableView table={table} /> : null}
    </>
  );
}

function PointsList({ points }: { points: string[] }) {
  return (
    <>
      <span id="summary-points-label" className={styles.pointsLabel}>
        핵심
      </span>
      <ul className={styles.summaryPoints} aria-labelledby="summary-points-label">
        {points.map((point, i) => (
          <li key={`${i}-${point}`}>{point}</li>
        ))}
      </ul>
    </>
  );
}

function SummaryTableView({ table }: { table: SummaryTable }) {
  return (
    <table className={styles.summaryTable}>
      <thead>
        <tr>
          {table.head.map((cell, j) => (
            <th key={j} scope="col">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, j) => (
          <tr key={j}>
            {/* 첫 칸은 그 행의 이름이다 — 스크린리더에도 행 머리칸으로 알린다. */}
            {row.map((cell, k) =>
              k === 0 ? (
                <th key={k} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={k}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
