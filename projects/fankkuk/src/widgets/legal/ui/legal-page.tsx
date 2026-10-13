import type { LegalBlock, LegalDoc } from "../model/legal-doc";
import s from "./legal.module.css";

// 이용약관·개인정보처리방침 공용 글 화면. 시안: docs/design/mockups/site/v18/legal.html — 로그인 전 1152 선
// 페이지 머리(제목 24 왼쪽·설명) → 사실 카드 셋 → 맨 위 목차 카드 → 조마다 구분선 + 제목 + 글(760 기둥).
// 표는 쓰지 않는다 — 이름·값 줄(rows)은 카드 격자로, 휴대폰 폭에서는 한 줄에 하나씩 쌓여 가로로 밀리지 않는다.

// icon 은 v11 머리 그림 자리였다 — v18 페이지 머리에는 그림이 없어 쓰지 않는다(부르는 쪽 모양은 그대로 둔다)
type Props = { doc: LegalDoc; icon: string };

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "text":
      return <p>{block.text}</p>;
    case "list":
      return (
        <ul className="dots">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="steps-ol">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case "rows":
      return (
        // 시안: 요금 셋은 3열, 나머지는 2열
        <div className={`grid ${block.rows.length === 3 ? "cols-3 keep" : "cols-2"}`}>
          {block.rows.map((row) => (
            <div key={row.title} className="card">
              <h3>{row.title}</h3>
              <dl className={`kv ${s.kv}`}>
                {row.fields.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      );
  }
}

export function LegalPage({ doc }: Props) {
  return (
    <main id="main" className={s.page}>
      <section aria-labelledby="page-title">
        <div className="pub-inner">
          <header className="page-head">
            <div className="ph-row">
              <h1 className="ph-title" id="page-title">
                {doc.title}
              </h1>
            </div>
            <p className="ph-desc">{doc.lead}</p>
          </header>
          <dl className={s.facts}>
            {doc.facts.map(([k, v]) => (
              <div key={k} className="card">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className={s.sec} aria-labelledby="toc-title">
        <div className="pub-inner">
          <nav className={`card card--soft ${s.toc}`} aria-labelledby="toc-title">
            <h2 className="t-card" id="toc-title">
              목차
            </h2>
            <ol>
              {doc.sections.map((sec) => (
                <li key={sec.id}>
                  <a href={`#${sec.id}`}>{sec.title}</a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </section>

      <section className={s.sec} aria-label={`${doc.title} 본문`}>
        <div className="pub-inner">
          {doc.sections.map((sec) => (
            <section key={sec.id} id={sec.id} className={s.art} aria-labelledby={`${sec.id}-h`}>
              <h2 className="t-card" id={`${sec.id}-h`}>
                {sec.title}
              </h2>
              <div className={`prose ${s.prose}`}>
                {sec.blocks.map((b, i) => (
                  <Block key={i} block={b} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
