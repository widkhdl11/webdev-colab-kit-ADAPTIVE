import type { LegalBlock, LegalDoc } from "../model/legal-doc";
import s from "./legal.module.css";

// 안내 글 화면(보안·검수·이용 안내·분쟁 안내). 시안: docs/design/mockups/site/v18/legal.html — 로그인 전 1152 선
// 버전이 있는 세 글(이용약관·개인정보처리방침·취소·환불 규정)은 policy-page(v26)로 옮겼다.
// 페이지 머리(제목 24 왼쪽·설명) → 사실 카드 셋 → 맨 위 목차 카드 → 조마다 구분선 + 제목 + 글(760 기둥).
// 표는 쓰지 않는다 — 이름·값 줄(rows)은 카드 격자로, 휴대폰 폭에서는 한 줄에 하나씩 쌓여 가로로 밀리지 않는다.

// icon 은 v11 머리 그림 자리였다 — v18 페이지 머리에는 그림이 없어 쓰지 않는다(부르는 쪽 모양은 그대로 둔다)
// flow: 보안 안내의 그림(차례대로 이어지는 칸) — 요약 아래에 한 줄로, 휴대폰 폭에서는 위아래로 쌓인다.
type FlowStep = { title: string; text: string };
type Props = {
  doc: LegalDoc;
  icon: string;
  flow?: readonly FlowStep[];
  flowLabel?: string;
};

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
    // 정의·요금표는 지금 세 글(policy-page)만 쓴다 — 안내 페이지가 쓰게 되면 점 목록·카드 격자로 보인다
    case "defs":
      return (
        <ul className="dots">
          {block.items.map(([term, def]) => (
            <li key={term}>
              「{term}」 — {def}
            </li>
          ))}
        </ul>
      );
    case "stages":
      return <p>{`${block.title}: ${block.items.join(" → ")}. ${block.note}`}</p>;
    case "prices":
      return (
        <div className={`grid ${block.rows.length === 3 ? "cols-3 keep" : "cols-2"}`}>
          {block.rows.map((r) => (
            <div key={r.name} className="card">
              <h3>{r.name}</h3>
              <dl className={`kv ${s.kv}`}>
                {[["기준", r.rule] as const, ...block.columns.map((c, i) => [c, r.amounts[i] ?? ""] as const)].map(([k, v]) => (
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

export function LegalPage({ doc, flow, flowLabel }: Props) {
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
          <div className={`card card--soft prose ${s.summary} ${s.prose}`}>
            <h2 className="t-card">요약</h2>
            <ul className="dots">
              {doc.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          {flow ? (
            <figure className={s.figure}>
              <ol className={s.flow}>
                {flow.map((step, i) => (
                  <li key={step.title} className="card">
                    <span className={s.flowNo} aria-hidden="true">
                      {i + 1}
                    </span>
                    <h3 className="t-strong">{step.title}</h3>
                    <p className={s.flowText}>{step.text}</p>
                  </li>
                ))}
              </ol>
              {flowLabel ? (
                <figcaption className="t-meta">{flowLabel}</figcaption>
              ) : null}
            </figure>
          ) : null}
          {/* 사실 칸이 「운영」 하나뿐인 안내 페이지는 칸을 그리지 않는다 — 버전·시행일이 있는 글만 셋이 된다 */}
          {doc.facts.length > 1 ? (
            <dl className={s.facts}>
              {doc.facts.map(([k, v]) => (
                <div key={k} className="card">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
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
