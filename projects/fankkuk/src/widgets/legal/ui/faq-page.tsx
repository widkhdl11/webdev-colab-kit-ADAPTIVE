"use client";

import { currentHashId } from "@/shared/lib/navigation/hash-id";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  chipTags,
  formatUpdated,
  summaryTargets,
  type NavItem,
} from "../model/doc-nav";
import type { FaqDoc } from "../model/faq-doc";
import {
  CopyAnchor,
  DocChips,
  DocSearch,
  DocSummary,
  FrequentBadge,
  Marked,
  focusSearch,
} from "./doc-parts";
import { DocBlock } from "./doc-blocks";
import { DocSideToc, DocTocBar } from "./doc-toc-bar";
import { useDocNav } from "./use-doc-nav";
import d from "./doc-page.module.css";

// 자주 묻는 질문(/faq) — 머리 + 「핵심 안내」 판 · 검색 · 분류 칩은 문서형 공통 부품(design-rules 28절, 문서형 C4·C5·C7),
// 접기 목록은 공지사항·고객센터와 같은 .acc(<details> 라 스크립트 없이 열고 닫힌다).
// 질문마다 고정 주소(#id) — 주소로 들어오거나 검색으로 가면 그 질문이 펼쳐진다(C8).
// 모양은 시안 faq-20261112(2026-11-12 사용자 「지금 판」): 요약은 번호 없는 가로 세 칸 · 첫 질문 펼침(28절) · 답 글 680 ·
// 요금 카드 · 경우 | 결과 줄 · 주의 판 · 넓은 화면은 옆 목차(28절).

/** 질문 칸(감싼 div)에 든 접기를 연다 */
function openDetails(el: HTMLElement) {
  const details = el.querySelector("details");
  if (details) details.open = true;
}

export function FaqPage({
  summary,
  items,
  summaryLinks,
  tagOrder,
  updated,
}: FaqDoc) {
  const navItems = useMemo<NavItem[]>(
    () =>
      items.map((f) => ({
        id: f.id,
        title: f.q,
        text: `${f.q}\n${f.a}`,
        tags: f.tags ?? [],
        frequent: f.frequent === true,
      })),
    [items],
  );
  const reveal = useCallback(openDetails, []);
  const nav = useDocNav(navItems, reveal);
  const tags = useMemo(
    () => chipTags(navItems, tagOrder),
    [navItems, tagOrder],
  );
  const groups = useMemo(
    () => [
      { title: null, items: items.map((f) => ({ id: f.id, label: f.q })) },
    ],
    [items],
  );
  const frequent = useMemo(
    () => new Set(items.filter((f) => f.frequent).map((f) => f.id)),
    [items],
  );
  const searchRef = useRef<HTMLInputElement>(null);
  // 첫 질문은 펼친 채로 연다(28절) — 다른 질문 주소(#id)로 들어왔으면 그 질문만 펼친다
  const firstRef = useRef<HTMLDetailsElement>(null);
  const firstId = items[0]?.id;
  useEffect(() => {
    const id = currentHashId();
    if (firstRef.current && id !== "" && id !== firstId && items.some((f) => f.id === id)) firstRef.current.open = false;
    // 들어온 때 한 번만 — 질문 목록(서버가 준 값)이 그대로인 동안 다시 돌지 않는다
  }, [firstId, items]);
  const targets = summaryTargets(
    summary,
    summaryLinks,
    items.map((f) => f.id),
  );

  return (
    <main id="main" className={`${d.page} ${d.withSide}`}>
      <section className={d.head} aria-labelledby="page-title">
        <div className="pub-inner">
          <div className={d.titleBox}>
            <h1 className={d.title} id="page-title">
              자주 묻는 질문
            </h1>
            <p className={d.lead}>이용 방법·요금·배송에 관한 질문과 답변입니다.</p>
          </div>
          {updated ? (
            <p className={d.updated}>
              최종 수정일{" "}
              <time dateTime={updated}>{formatUpdated(updated)}</time>
            </p>
          ) : null}
          <DocSummary
            heading="핵심 안내"
            lines={summary}
            targets={targets}
            onGo={(id) => nav.goTo(id, { push: true })}
            tiles={{ numbered: false }}
          />
        </div>
      </section>

      <section className={d.body} aria-label="질문 목록">
        <div className="pub-inner">
          <div className={d.tools}>
            <DocSearch
              query={nav.query}
              onQuery={nav.setQuery}
              count={nav.matches.length}
              unit="질문"
              onStep={nav.step}
              inputRef={searchRef}
            />
            {tags.length > 0 ? (
              <DocChips tags={tags} active={nav.tag} onPick={nav.setTag} />
            ) : null}
          </div>
          {/* 질문 목록 묶음 하나에 위에 붙는 목차 줄(C1) — 목차에서 고른 질문은 펼친 채로 간다 */}
          <div className={d.flow}>
            <DocTocBar
              groups={groups}
              current={nav.current}
              hidden={nav.hidden}
              frequent={frequent}
              onGo={(id) => nav.goTo(id, { focus: true, push: true })}
              onFind={() => focusSearch(searchRef.current)}
              chips={{ tags, active: nav.tag, onPick: nav.setTag }}
            />
            <div className={`acc ${d.faqList}`}>
              {items.map((f, i) => (
                <div
                  key={f.id}
                  id={f.id}
                  className={d.faqItem}
                  hidden={nav.hidden.has(f.id)}
                >
                  <details ref={i === 0 ? firstRef : undefined} open={i === 0 ? true : undefined}>
                    <summary data-doc-heading="">
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
                    <div className={`ans ${d.faqAns}`}>
                      {(f.blocks ?? f.a.split(/\n/).map((text) => ({ kind: "text" as const, text }))).map((b, bi) => (
                        <DocBlock key={bi} block={b} words={nav.words} strong={f.strong} />
                      ))}
                    </div>
                  </details>
                  <span className={d.faqCopy}>
                    <CopyAnchor id={f.id} title={f.q} />
                  </span>
                </div>
              ))}
            </div>
            {/* 옆 목차 — 화면에서는 목록 오른쪽 위(절대 위치), 읽는 차례는 목록 뒤 */}
            <DocSideToc
              groups={groups}
              current={nav.current}
              hidden={nav.hidden}
              frequent={frequent}
              onGo={(id) => nav.goTo(id, { focus: true, push: true })}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
