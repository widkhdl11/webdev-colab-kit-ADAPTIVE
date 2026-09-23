import { useId } from "react";
import { splitLead } from "@/entities/article";
import type { SummaryBlock, SummaryInline } from "@/entities/article";
import styles from "./article-view.module.css";

/**
 * AI 요약을 서식대로 그린다 (content-safety INV-D7).
 *
 * 해석은 entities 가 하고 여기는 **구조를 요소로 옮기기만** 한다. 해석 결과에는 링크·이미지를
 * 담을 자리가 없으므로, 이 컴포넌트가 만들 수 있는 요소는 p · strong · ul/li · table 뿐이다.
 * 글자는 전부 React 텍스트 노드로 들어가 이스케이프된다 — HTML 문자열을 만들지 않는다(INV-D3).
 */
export function AiSummaryBody({ text, points }: { text: string; points: string[] }) {
  const { lead, rest } = splitLead(text);
  // 「핵심」 라벨이 목록의 이름이다 — 스크린리더가 목록을 읽을 때 붙여 읽는다(승인 시안과 같다).
  const pointsLabelId = useId();
  return (
    <>
      {/* 한 문장 요약 — 저장할 때 첫 문단으로 붙인다(수집 쪽 leadToMarkup). 옛 요약은 문단이
          하나뿐이라 그 문단이 여기 선다: 모양만 앞세움이고 내용은 예전과 같다. */}
      {lead !== null ? (
        <p className={styles.summaryLead}>
          <Inlines parts={lead} />
        </p>
      ) : null}
      {/* 「핵심」 (INV-S7) — 한 문장 바로 아래. 상자를 열자마자 세 줄로 무슨 일인지 안다. */}
      {points.length > 0 ? (
        <>
          <span id={pointsLabelId} className={styles.pointsLabel}>
            핵심
          </span>
          <ul className={styles.summaryPoints} aria-labelledby={pointsLabelId}>
            {points.map((point, i) => (
              <li key={`${i}-${point}`}>{point}</li>
            ))}
          </ul>
        </>
      ) : null}
      <SummaryBlocks blocks={rest} />
    </>
  );
}

function SummaryBlocks({ blocks }: { blocks: SummaryBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === "paragraph") {
          return (
            <p key={i}>
              <Inlines parts={block.inlines} />
            </p>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inlines parts={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <table key={i} className={styles.summaryTable}>
            <thead>
              <tr>
                {block.head.map((cell, j) => (
                  <th key={j} scope="col">
                    <Inlines parts={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, j) => (
                <tr key={j}>
                  {/* 첫 칸은 그 행의 이름이다(모델명 등) — 눈으로 굵게 보이는 만큼 스크린리더에도
                      행 머리칸으로 알린다. */}
                  {row.map((cell, k) =>
                    k === 0 ? (
                      <th key={k} scope="row">
                        <Inlines parts={cell} />
                      </th>
                    ) : (
                      <td key={k}>
                        <Inlines parts={cell} />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </>
  );
}

function Inlines({ parts }: { parts: SummaryInline[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "bold" ? <strong key={i}>{part.text}</strong> : part.text,
      )}
    </>
  );
}
