import type { SummaryTable } from "@/entities/article";
import styles from "./article-view.module.css";

/**
 * 「핵심」 절 본문 — 칸으로 나뉜 요약을 **글자로만** 그린다 (content-safety INV-D7 · ingestion-ranking INV-S8).
 *
 * 글자 안의 기호는 해석하지 않는다. 한 줄 요약·핵심·표가 따로 저장된 칸이라 해석할 것이 없다 —
 * 요약에 심은 `**`·`[글](주소)` 는 글자 그대로 보인다. HTML 문자열을 만들지 않는다(INV-D3).
 *
 * 순서는 2026-09-23 승인 시안(article-detail-v2): 핵심 번호 셋 → 표. 한 줄 요약은 제목 아래에 선다.
 */
export function AiSummaryBody({
  isLegacy,
  legacyText,
  points,
  table,
}: {
  /** 옛 형식인가 — 판정은 displaySummary 가 한다. 새 형식의 한 줄 요약은 제목 아래에 따로 선다. */
  isLegacy: boolean;
  /** 옛 요약 문단(옛 형식일 때만 쓴다). */
  legacyText: string;
  points: string[];
  table: SummaryTable | null;
}) {
  return (
    <>
      {points.length > 0 ? (
        <ol className={styles.keyPoints}>
          {points.map((point, i) => (
            <li key={`${i}-${point}`}>{point}</li>
          ))}
        </ol>
      ) : null}
      {/* 옛 요약 호환 (사용자 결정 2026-09-23 「다시 요약하지 않는다」). 문단은 핵심을 되풀이하는
          경우가 많아 접어 둔다. 핵심이 없는 옛 글은 문단이 유일한 요약이라 펼친 채로 둔다. */}
      {isLegacy && points.length > 0 ? (
        <details className={styles.legacy}>
          <summary>이전 형식의 요약 문단 보기</summary>
          <p>{legacyText}</p>
        </details>
      ) : null}
      {isLegacy && points.length === 0 ? <p className={styles.excerpt}>{legacyText}</p> : null}
      {table !== null ? <SummaryTableView table={table} /> : null}
    </>
  );
}

function SummaryTableView({ table }: { table: SummaryTable }) {
  return (
    <table className={styles.summaryTable}>
      {/* 표에 이름이 없으면 스크린리더가 「표」라고만 읽는다 — 눈에는 절 제목이 이름을 대신한다. */}
      <caption className="sr-only">요약 표</caption>
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
