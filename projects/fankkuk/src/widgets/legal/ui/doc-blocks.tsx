import { rowShown } from "../model/doc-nav";
import type { LegalBlock, RefundTone } from "../model/legal-doc";
import { Marked } from "./doc-parts";
import s from "./doc-page.module.css";

// 조 안의 글 모양(design-rules 14절) — 약관 셋과 안내 글이 같은 모양을 쓴다(28절). 찾은 낱말은 어느 모양 안에서든 <mark>.

/** 환불 금액 칸 — 전액은 값 전체를 초록 꼬리표로, 없음은 「없음」 빨강 꼬리표 + (짧은 값이 아니면) 뒤에 설명 */
function RefundValue({ value, tone, words }: { value: string; tone?: RefundTone; words: readonly string[] }) {
  const text = <Marked text={value} words={words} />;
  if (tone === "full") return <span className={`${s.pill} ${s.pillFull}`}>{text}</span>;
  if (tone === "none") {
    if (value.endsWith("없음")) return <span className={`${s.pill} ${s.pillNone}`}>{text}</span>;
    return (
      <>
        <span className={`${s.pill} ${s.pillNone}`}>없음</span> {text}
      </>
    );
  }
  return text;
}

/**
 * @param tag 고른 분류 칩 — 줄에 꼬리표가 있는 상자(rows)만 거른다. 남는 줄이 없으면 상자를 그리지 않는다
 */
export function DocBlock({ block, words, tag = null }: { block: LegalBlock; words: readonly string[]; tag?: string | null }) {
  const m = (text: string) => <Marked text={text} words={words} />;
  switch (block.kind) {
    case "text":
      return <p>{m(block.text)}</p>;
    case "list":
      return (
        <ul className={s.dots}>
          {block.items.map((item) => (
            <li key={item}>{m(item)}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className={s.steps}>
          {block.items.map((item) => (
            <li key={item}>{m(item)}</li>
          ))}
        </ol>
      );
    case "defs":
      return (
        <dl className={s.box}>
          {block.items.map(([term, def]) => (
            <div key={term} className={s.defRow}>
              <dt>{m(term)}</dt>
              <dd>{m(def)}</dd>
            </div>
          ))}
        </dl>
      );
    case "prices":
      return (
        <div className={s.box}>
          <table className={s.prices}>
            <caption className="sr-only">상자 구간별 요금</caption>
            <thead>
              <tr>
                <th scope="col">구간</th>
                {block.columns.map((c) => (
                  <th key={c} scope="col">
                    {m(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r) => (
                <tr key={r.name}>
                  <th scope="row">
                    <strong>{m(r.name)}</strong>
                    <span>{m(r.rule)}</span>
                  </th>
                  {r.amounts.map((a, i) => (
                    <td key={i} className={i === 0 ? s.amountMain : undefined}>
                      {m(a)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "stages":
      return (
        <div className={s.stages}>
          <p className={s.stagesT}>{m(block.title)}</p>
          <ol className={s.stageChips}>
            {block.items.map((item) => (
              <li key={item}>
                <span className={s.stageChip}>{m(item)}</span>
              </li>
            ))}
          </ol>
          <p className={s.stagesNote}>{m(block.note)}</p>
        </div>
      );
    case "rows": {
      const rows = block.rows.filter((r) => rowShown(r, tag));
      if (rows.length === 0) return null;
      return (
        <div className={s.box}>
          {rows.map((row) => (
            <div key={row.title} className={s.caseRow}>
              <h3>{m(row.title)}</h3>
              <dl className={s.kv}>
                {row.fields.map(([k, v, tone]) => (
                  <div key={k}>
                    <dt>{m(k)}</dt>
                    <dd>
                      <RefundValue value={v} tone={tone} words={words} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      );
    }
  }
}
