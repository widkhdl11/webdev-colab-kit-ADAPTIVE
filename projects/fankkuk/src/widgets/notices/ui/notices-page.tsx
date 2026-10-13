import Link from "next/link";
import type { Notice, NoticeBlock } from "@/entities/notice/model/notice";
import s from "./notices.module.css";

// 공지사항. 시안: docs/design/mockups/site/v11/notices.html
// 접기 목록(.acc) 한 줄에 하나, 눌러서 펼친다(<details> — 스크립트 없이 열고 닫힌다). 쪽 넘김은 ?page=N 링크.

type Props = { notices: readonly Notice[]; page: number; pageCount: number };

const pageHref = (n: number) => (n === 1 ? "/notices" : `/notices?page=${n}`);

function Block({ block }: { block: NoticeBlock }) {
  switch (block.type) {
    case "heading":
      return <h3>{block.text}</h3>;
    case "signature":
      return <p className="t-meta">{block.text}</p>;
    case "list":
      return (
        <ul className="dots">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "text":
      return (
        <p>
          {block.parts.map((part, i) =>
            typeof part === "string" ? (
              part
            ) : (
              <Link key={i} className={s.link} href={part.href}>
                {part.label}
              </Link>
            ),
          )}
        </p>
      );
  }
}

export function NoticesPage({ notices, page, pageCount }: Props) {
  return (
    <main id="main">
      <section className="section section--compact" aria-labelledby="page-title">
        <div className="container">
          <div className="sec-head">
            <img className="sec-icon" src="/img/icon-notice.png" width={72} height={72} alt="" aria-hidden="true" />
            <h1 className="t-title" id="page-title">
              공지사항
            </h1>
          </div>
          <div className={`acc ${s.list}`}>
            <ul aria-label="공지사항 목록">
              {notices.map((n, i) => (
                <li key={n.id}>
                  {/* 첫 쪽의 맨 위 글만 펼쳐 둔다(시안) */}
                  <details open={page === 1 && i === 0}>
                    <summary>
                      {n.pinned && <span className="tag tag--brand">고정</span>}
                      <span className="q">
                        <b>{n.title}</b>
                        <span className="t-meta">{n.date.replaceAll("-", ".")}</span>
                      </span>
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    <div className="ans prose">
                      {n.body.map((b, j) => (
                        <Block key={j} block={b} />
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
          {pageCount > 1 && (
            <nav className={s.pager} aria-label="공지사항 페이지">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} aria-label="이전 페이지">
                  &lsaquo;
                </Link>
              ) : (
                <span aria-hidden="true">&lsaquo;</span>
              )}
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <Link key={n} href={pageHref(n)} aria-label={`${n}페이지`} aria-current={n === page ? "page" : undefined}>
                  {n}
                </Link>
              ))}
              {page < pageCount ? (
                <Link href={pageHref(page + 1)} aria-label="다음 페이지">
                  &rsaquo;
                </Link>
              ) : (
                <span aria-hidden="true">&rsaquo;</span>
              )}
            </nav>
          )}
        </div>
      </section>
    </main>
  );
}
