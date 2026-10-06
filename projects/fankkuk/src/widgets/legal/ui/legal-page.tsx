import type { LegalBlock, LegalDoc } from "../model/legal-doc";
import s from "./legal.module.css";

// 이용약관·개인정보처리방침 공용 글 화면. 새 레이아웃 언어를 만들지 않고 승인된 화면의 부품을 쓴다 —
// 제목 줄 + 오른쪽 아이콘 칸(공지사항·고객센터 시안 notices.html·support.html), 회색 면 칸(고객센터 연락처 칸)을 목차로,
// 점 목록·구분선은 공지 본문과 같은 값. 1024px 이상은 목차가 왼쪽에 붙어 따라 내려오고, 그 아래 폭은 본문 위에 놓인다.
// 표는 쓰지 않는다 — 이름·값 줄(rows)은 휴대폰 폭에서 위아래로 쌓여 가로로 밀리지 않는다.

type Props = { doc: LegalDoc; icon: string };

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "text":
      return <p>{block.text}</p>;
    case "list":
      return (
        <ul className={s.dots}>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className={s.steps}>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case "rows":
      return (
        <div className={s.rows}>
          {block.rows.map((row) => (
            <div key={row.title} className={s.row}>
              <h3 className={s["row-t"]}>{row.title}</h3>
              <dl>
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

export function LegalPage({ doc, icon }: Props) {
  return (
    <main id="main">
      <div className="container">
        <div className="page-top">
          <div>
            <h1 className="page-h">{doc.title}</h1>
            <p className={`lead ${s.lead}`}>{doc.lead}</p>
            <dl className={s.facts}>
              {doc.facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className={s["tile-ico"]} aria-hidden="true">
            <img className="asset" src={icon} width={72} height={72} alt="" />
          </div>
        </div>
        <div className={s.layout}>
          <nav className={s.toc} aria-labelledby="toc-title">
            <p className={s["toc-h"]} id="toc-title">
              목차
            </p>
            <ol>
              {doc.sections.map((sec) => (
                <li key={sec.id}>
                  <a href={`#${sec.id}`}>{sec.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <div className={s.body}>
            {doc.sections.map((sec) => (
              <section key={sec.id} id={sec.id} className={s.sec} aria-labelledby={`${sec.id}-h`}>
                <h2 id={`${sec.id}-h`}>{sec.title}</h2>
                {sec.blocks.map((b, i) => (
                  <Block key={i} block={b} />
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
      <div className="page-end" />
    </main>
  );
}
