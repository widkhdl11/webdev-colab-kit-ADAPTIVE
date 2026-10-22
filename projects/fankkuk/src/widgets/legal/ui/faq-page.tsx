"use client";

import { useCallback, useMemo } from "react";
import { chipTags, formatUpdated, summaryTargets, type NavItem } from "../model/doc-nav";
import type { FaqDoc } from "../model/faq-doc";
import { CopyAnchor, DocChips, DocSearch, DocSummary, FrequentBadge, Marked } from "./doc-parts";
import { useDocNav } from "./use-doc-nav";
import d from "./doc-page.module.css";

// 자주 묻는 질문(/faq) — 머리 + 「먼저 알아 두세요」 판 · 검색 · 분류 칩은 문서형 공통 부품(design-rules 28절, 문서형 C4·C5·C7),
// 접기 목록은 공지사항·고객센터와 같은 .acc(<details> 라 스크립트 없이 열고 닫힌다).
// 질문마다 고정 주소(#id) — 주소로 들어오거나 검색으로 가면 그 질문이 펼쳐진다(C8).

/** 질문 칸(감싼 div)에 든 접기를 연다 */
function openDetails(el: HTMLElement) {
  const details = el.querySelector("details");
  if (details) details.open = true;
}

export function FaqPage({ summary, items, summaryLinks, tagOrder, updated }: FaqDoc) {
  const navItems = useMemo<NavItem[]>(
    () => items.map((f) => ({ id: f.id, title: f.q, text: `${f.q}\n${f.a}`, tags: f.tags ?? [], frequent: f.frequent === true })),
    [items],
  );
  const reveal = useCallback(openDetails, []);
  const nav = useDocNav(navItems, reveal);
  const tags = useMemo(() => chipTags(navItems, tagOrder), [navItems, tagOrder]);
  const targets = summaryTargets(
    summary,
    summaryLinks,
    items.map((f) => f.id),
  );

  return (
    <main id="main" className={`${d.page} ${d.guide}`}>
      <section className={d.head} aria-labelledby="page-title">
        <div className="pub-inner">
          <div className={d.titleBox}>
            <h1 className={d.title} id="page-title">
              자주 묻는 질문
            </h1>
            <p className={d.lead}>팬꾹을 쓰면서 자주 묻는 것을 모았어요.</p>
          </div>
          {updated ? (
            <p className={d.updated}>
              최종 수정일 <time dateTime={updated}>{formatUpdated(updated)}</time>
            </p>
          ) : null}
          <DocSummary heading="먼저 알아 두세요" lines={summary} targets={targets} onGo={(id) => nav.goTo(id, { push: true })} />
        </div>
      </section>

      <section className={d.body} aria-label="질문 목록">
        <div className="pub-inner">
          <div className={d.tools}>
            <DocSearch query={nav.query} onQuery={nav.setQuery} count={nav.matches.length} unit="질문" onStep={nav.step} />
            {tags.length > 0 ? <DocChips tags={tags} active={nav.tag} onPick={nav.setTag} /> : null}
          </div>
          <div className="acc">
            {items.map((f) => (
              <div key={f.id} id={f.id} className={d.faqItem} hidden={nav.hidden.has(f.id)}>
                <details>
                  <summary>
                    <span className="q">
                      <b>
                        <Marked text={f.q} words={nav.words} />
                      </b>
                      {f.frequent ? <FrequentBadge /> : null}
                    </span>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path
                        d="m4 7.5 6 6 6-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </summary>
                  <div className="ans">
                    <p>
                      <Marked text={f.a} words={nav.words} />
                    </p>
                  </div>
                </details>
                <span className={d.faqCopy}>
                  <CopyAnchor id={f.id} title={f.q} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
