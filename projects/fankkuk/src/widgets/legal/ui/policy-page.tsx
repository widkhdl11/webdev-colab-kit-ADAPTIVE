import Link from "next/link";
import type { LegalBlock, LegalDoc, RefundTone } from "../model/legal-doc";
import type { VersionedKind, VersionLink } from "../model/legal-versions";
import { PolicyToc, type TocGroup } from "./policy-toc";
import s from "./policy-page.module.css";

// 버전이 있는 세 글(이용약관·개인정보처리방침·환불 규정) 화면. 시안: docs/design/mockups/site/v26-terms/index.html
// 세 글 탭 → 제목·설명 → 사실 한 줄(버전·시행일·운영) → 「먼저 세 가지」 판 → 왼쪽 따라오는 목차 + 680 글 기둥.
// 1023 이하는 왼쪽 목차 대신 글 위 접는 칸. 안내 페이지(보안·검수·이용 안내)는 legal-page 그대로다.

const TABS: readonly (readonly [VersionedKind, string, string])[] = [
  ["terms", "/terms", "이용약관"],
  ["privacy", "/privacy", "개인정보처리방침"],
  ["refund", "/refund", "취소·환불 규정"],
];

type Props = { kind: VersionedKind; doc: LegalDoc; history: readonly VersionLink[]; pastVersion: boolean };

/** 「제7조 이용요금과 결제」 → 꼬리표 「제7조」 + 제목 「이용요금과 결제」. 조 번호가 없는 제목은 그대로 */
function splitArticle(title: string): { no: string | null; name: string } {
  const m = /^(제\d+조)\s+(.+)$/.exec(title);
  return m ? { no: m[1]!, name: m[2]! } : { no: null, name: title };
}

/** 환불 금액 칸 — 전액은 값 전체를 초록 꼬리표로, 없음은 「없음」 빨강 꼬리표 + (짧은 값이 아니면) 뒤에 설명 */
function RefundValue({ value, tone }: { value: string; tone?: RefundTone }) {
  if (tone === "full") return <span className={`${s.pill} ${s.pillFull}`}>{value}</span>;
  if (tone === "none") {
    if (value.endsWith("없음")) return <span className={`${s.pill} ${s.pillNone}`}>{value}</span>;
    return (
      <>
        <span className={`${s.pill} ${s.pillNone}`}>없음</span> {value}
      </>
    );
  }
  return <>{value}</>;
}

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
    case "defs":
      return (
        <dl className={s.box}>
          {block.items.map(([term, def]) => (
            <div key={term} className={s.defRow}>
              <dt>{term}</dt>
              <dd>{def}</dd>
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
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r) => (
                <tr key={r.name}>
                  <th scope="row">
                    <strong>{r.name}</strong>
                    <span>{r.rule}</span>
                  </th>
                  {r.amounts.map((a, i) => (
                    <td key={i} className={i === 0 ? s.amountMain : undefined}>
                      {a}
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
          <p className={s.stagesT}>{block.title}</p>
          <ol className={s.chips}>
            {block.items.map((item) => (
              <li key={item}>
                <span className={s.chip}>{item}</span>
              </li>
            ))}
          </ol>
          <p className={s.stagesNote}>{block.note}</p>
        </div>
      );
    case "rows":
      return (
        <div className={s.box}>
          {block.rows.map((row) => (
            <div key={row.title} className={s.caseRow}>
              <h3>{row.title}</h3>
              <dl className={s.kv}>
                {row.fields.map(([k, v, tone]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <RefundValue value={v} tone={tone} />
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

export function PolicyPage({ kind, doc, history, pastVersion }: Props) {
  const label = new Map(doc.sections.map((sec) => [sec.id, sec.title]));
  // 묶음에 없는 id 는 빼고, 어느 묶음에도 없는 조는 맨 뒤 이름 없는 묶음으로 — 목차에서 조가 조용히 빠지지 않게
  const grouped = new Set(doc.tocGroups?.flatMap((g) => g.ids) ?? []);
  const rest = doc.sections.filter((sec) => !grouped.has(sec.id)).map((sec) => ({ id: sec.id, label: sec.title }));
  const groups: TocGroup[] = [
    ...(doc.tocGroups ?? []).map((g) => ({
      title: g.title,
      items: g.ids.flatMap((id) => {
        const name = label.get(id);
        return name ? [{ id, label: name }] : [];
      }),
    })),
    ...(rest.length > 0 ? [{ title: null, items: rest }] : []),
  ];
  const current = history.find((h) => h.current);

  return (
    <main id="main" className={s.page}>
      <section className={s.head} aria-labelledby="page-title">
        <div className="pub-inner">
          <nav className={s.tabs} aria-label="약관과 정책">
            {TABS.map(([k, href, name]) => (
              <Link key={k} href={href} className={s.tab} aria-current={k === kind ? "page" : undefined}>
                {name}
              </Link>
            ))}
          </nav>
          <div className={s.titleBox}>
            <h1 className={s.title} id="page-title">
              {doc.title}
            </h1>
            <p className={s.lead}>{doc.lead}</p>
          </div>
          <p className={s.facts}>
            {doc.facts.map(([k, v]) => (
              <span key={k}>
                {k} <strong>{v}</strong>
              </span>
            ))}
            <a href="#versions">버전 기록 보기</a>
          </p>
          {pastVersion ? (
            <p className={s.past} role="note">
              지난 버전이에요. 지금 시행 중인 글은 <Link href={current?.href ?? "/"}>최신 버전</Link>에서 볼 수 있어요.
            </p>
          ) : null}
          <div className={s.summary}>
            <h2 className={s.summaryT}>먼저 세 가지만 알아 두세요</h2>
            <ol className={s.summaryList}>
              {doc.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className={s.body} aria-label={`${doc.title} 본문`}>
        <div className={`pub-inner ${s.layout}`}>
          <PolicyToc groups={groups} />
          <div className={s.main}>
            <details className={s.tocTop}>
              <summary>목차 · {doc.sections.length}개</summary>
              <div className={s.tocTopList}>
                {doc.sections.map((sec) => (
                  <a key={sec.id} className={s.tocLink} href={`#${sec.id}`}>
                    {sec.title}
                  </a>
                ))}
              </div>
            </details>

            {doc.sections.map((sec) => {
              const { no, name } = splitArticle(sec.title);
              return (
                <article key={sec.id} id={sec.id} className={s.art} aria-labelledby={`${sec.id}-h`}>
                  {no ? <span className={s.no}>{no}</span> : null}
                  <h2 className={s.artT} id={`${sec.id}-h`}>
                    {name}
                  </h2>
                  <div className={s.prose}>
                    {sec.blocks.map((b, i) => (
                      <Block key={i} block={b} />
                    ))}
                  </div>
                </article>
              );
            })}

            <section id="versions" className={s.art} aria-labelledby="versions-h">
              <h2 className={s.artT} id="versions-h">
                버전 기록
              </h2>
              <ul className={s.versions}>
                {history.map((v) => (
                  <li key={v.version} className={s.version}>
                    <span>
                      <Link href={v.href} aria-current={v.current && !pastVersion ? "page" : undefined}>
                        버전 {v.version}
                      </Link>{" "}
                      <span className={s.sub}>· 시행일 {v.effective}</span>
                    </span>
                    {v.current ? <span className={s.nowTag}>지금 시행 중</span> : null}
                  </li>
                ))}
              </ul>
              {history.length === 1 ? <p className={s.note}>지난 버전은 아직 없어요.</p> : null}
            </section>

            <div className={s.ask}>
              <h2 className={s.summaryT}>{doc.title}에서 이해가 안 되는 부분이 있나요?</h2>
              <p className={s.sub}>고객센터에 물어보시면 쉬운 말로 다시 설명해 드려요.</p>
              <Link className="btn" href="/support">
                고객센터 가기
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
