import { parseSummaryMarkup } from "@/entities/article";
import type { SummaryInline } from "@/entities/article";
import styles from "./article-view.module.css";

/**
 * AI 요약을 서식대로 그린다 (content-safety INV-D7).
 *
 * 해석은 entities 가 하고 여기는 **구조를 요소로 옮기기만** 한다. 해석 결과에는 링크·이미지를
 * 담을 자리가 없으므로, 이 컴포넌트가 만들 수 있는 요소는 p · strong · ul/li · table 뿐이다.
 * 글자는 전부 React 텍스트 노드로 들어가 이스케이프된다 — HTML 문자열을 만들지 않는다(INV-D3).
 */
export function SummaryMarkup({ source }: { source: string }) {
  const blocks = parseSummaryMarkup(source);
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
                  {row.map((cell, k) => (
                    <td key={k}>
                      <Inlines parts={cell} />
                    </td>
                  ))}
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
