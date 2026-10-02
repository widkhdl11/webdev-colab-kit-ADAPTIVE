import Link from "next/link";
import type { Notice, NoticeBlock } from "@/entities/notice/model/notice";
import s from "./notices.module.css";

// 공지사항. 시안: docs/design/mockups/site/v4/notices.html
// 한 줄에 하나, 눌러서 펼친다(<details> — 스크립트 없이 열고 닫힌다). 쪽 넘김은 ?page=N 링크.

type Props = { notices: readonly Notice[]; page: number; pageCount: number };

const pageHref = (n: number) => (n === 1 ? "/notices" : `/notices?page=${n}`);

function Block({ block }: { block: NoticeBlock }) {
  switch (block.type) {
    case "heading":
      return <h3>{block.text}</h3>;
    case "signature":
      return <p className={s.signature}>{block.text}</p>;
    case "list":
      return (
        <ul className={s.dots}>
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
      <div className="container">
        <div className="page-top">
          <div>
            <h1 className="page-h">공지사항</h1>
          </div>
          <div className={s["tile-ico"]} aria-hidden="true">
            <img className="asset" src="/img/icon-notice.png" width={72} height={72} alt="" />
          </div>
        </div>
        <ul className={s.nl} aria-label="공지사항 목록">
          {notices.map((n, i) => (
            <li key={n.id}>
              {/* 첫 쪽의 맨 위 글만 펼쳐 둔다(시안) */}
              <details open={page === 1 && i === 0}>
                <summary>
                  <span className={s.pin}>{n.pinned && <span className="tag tag--brand">고정</span>}</span>
                  <span className={s.t}>{n.title}</span>
                  <span className={s.d}>{n.date.replaceAll("-", ".")}</span>
                  <svg className={s.chev} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div className={s.body}>
                  {n.body.map((b, j) => (
                    <Block key={j} block={b} />
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
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
      <div className="page-end" />
    </main>
  );
}
