"use client";

import Link from "next/link";
import { useMemo, useRef, type ReactNode } from "react";
import { chipTags, formatUpdated, sectionItems, summaryTargets, tocGroupsOf } from "../model/doc-nav";
import type { LegalDoc } from "../model/legal-doc";
import { DocBlock } from "./doc-blocks";
import { CopyAnchor, DocChips, DocSearch, DocSummary, DocTabRow, FrequentBadge, Marked, focusSearch, type DocTabs } from "./doc-parts";
import { DocTocBar } from "./doc-toc-bar";
import { useDocNav } from "./use-doc-nav";
import s from "./doc-page.module.css";

// 문서형 페이지 공통 틀(C12) — 약관 셋(policy-page)과 안내 글(legal-page)이 조립만 한다.
// 탭 → 제목·설명 → 최종 수정일 / 사실 한 줄 → (지난 버전 알림) → 요약 판 → (그림) → 검색 · 분류 칩 → 위에 붙는 목차 줄 → 조 → (버전 기록) → (고객센터 판).
// 기준: docs/ux/document-pages.md, 차이 목록 _diff-document-pages.md(D1 ② · C1~C10), 모양 design-rules 14절 · 28절.

type Props = {
  doc: LegalDoc;
  /** policy = 약관 세 글(제목 32 · 조 제목 24), guide = 안내 글(제목 24 · 조 제목 20, 28절) */
  variant: "policy" | "guide";
  tabs?: DocTabs;
  /** 머리 아래 줄 — 약관의 사실 한 줄(버전 · 시행일 · 운영) */
  meta?: ReactNode;
  /** 지난 버전 알림 */
  notice?: ReactNode;
  /** 요약 아래 그림(보안 안내의 흐름) */
  figure?: ReactNode;
  /** 조 다음 — 약관의 버전 기록 */
  after?: ReactNode;
  /** 맨 아래 「OO에서 이해가 안 되는 부분이 있나요?」 판 */
  ask?: boolean;
};

/** 「제7조 이용요금과 결제」 → 꼬리표 「제7조」 + 제목 「이용요금과 결제」. 조 번호가 없는 제목은 그대로 */
function splitArticle(title: string): { no: string | null; name: string } {
  const m = /^(제\d+조)\s+(.+)$/.exec(title);
  return m ? { no: m[1]!, name: m[2]! } : { no: null, name: title };
}

export function DocPage({ doc, variant, tabs, meta, notice, figure, after, ask = false }: Props) {
  const items = useMemo(() => sectionItems(doc.sections), [doc.sections]);
  const nav = useDocNav(items);
  const groups = useMemo(() => tocGroupsOf(doc), [doc]);
  const tags = useMemo(() => chipTags(items, doc.tagOrder), [items, doc.tagOrder]);
  const frequent = useMemo(() => new Set(items.filter((i) => i.frequent).map((i) => i.id)), [items]);
  const targets = summaryTargets(
    doc.summary,
    doc.summaryLinks,
    items.map((i) => i.id),
  );
  const guide = variant === "guide";
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <main id="main" className={`${s.page}${guide ? ` ${s.guide}` : ""}`}>
      <section className={s.head} aria-labelledby="page-title">
        <div className="pub-inner">
          {tabs ? <DocTabRow tabs={tabs} /> : null}
          <div className={s.titleBox}>
            <h1 className={s.title} id="page-title">
              {doc.title}
            </h1>
            <p className={s.lead}>{doc.lead}</p>
          </div>
          {doc.updated ? (
            <p className={s.updated}>
              최종 수정일 <time dateTime={doc.updated}>{formatUpdated(doc.updated)}</time>
            </p>
          ) : null}
          {meta}
          {notice}
          <DocSummary
            heading={guide ? "핵심 안내" : "주요 내용"}
            lines={doc.summary}
            targets={targets}
            onGo={(id) => nav.goTo(id, { focus: true, push: true, showAll: true })}
          />
          {figure}
        </div>
      </section>

      <section className={s.body} aria-label={`${doc.title} 본문`}>
        <div className="pub-inner">
          <div className={s.tools}>
            <DocSearch query={nav.query} onQuery={nav.setQuery} count={nav.matches.length} unit="조" onStep={nav.step} inputRef={searchRef} />
            {tags.length > 0 ? <DocChips tags={tags} active={nav.tag} onPick={nav.setTag} /> : null}
          </div>
          <div className={s.flow}>
            <DocTocBar
              groups={groups}
              current={nav.current}
              hidden={nav.hidden}
              frequent={frequent}
              onGo={(id) => nav.goTo(id, { focus: true, push: true })}
              onFind={() => focusSearch(searchRef.current)}
              chips={{ tags, active: nav.tag, onPick: nav.setTag }}
            />
            <div className={s.main}>
              {doc.sections.map((sec) => {
                const { no, name } = splitArticle(sec.title);
                return (
                  <article
                    key={sec.id}
                    id={sec.id}
                    className={sec.closing ? `${s.art} ${s.closing}` : s.art}
                    aria-labelledby={`${sec.id}-h`}
                    hidden={nav.hidden.has(sec.id)}
                  >
                    {no ? <span className={s.no}>{no}</span> : null}
                    <div className={s.artHead}>
                      <h2 className={s.artT} id={`${sec.id}-h`} tabIndex={-1} data-doc-heading="">
                        <Marked text={name} words={nav.words} />
                      </h2>
                      {sec.frequent ? <FrequentBadge /> : null}
                      <CopyAnchor id={sec.id} title={sec.title} />
                    </div>
                    <div className={s.prose}>
                      {sec.blocks.map((b, i) => (
                        <DocBlock key={i} block={b} words={nav.words} tag={nav.tag} plain={sec.closing === true} links={sec.links} />
                      ))}
                    </div>
                  </article>
                );
              })}

              {after}

              {ask ? (
                <div className={s.ask}>
                  <h2 className={s.summaryT}>{doc.title}에서 이해가 안 되는 부분이 있나요?</h2>
                  <p className={s.sub}>고객센터로 문의해 주세요.</p>
                  <Link className="btn" href="/support">
                    고객센터
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
