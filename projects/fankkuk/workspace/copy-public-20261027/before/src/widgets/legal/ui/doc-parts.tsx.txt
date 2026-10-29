"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type MouseEvent, type Ref } from "react";
import { markParts } from "../model/doc-nav";
import s from "./doc-page.module.css";

// 문서형 페이지 공통 부품 — 약관 셋(policy-page) · 안내 글(legal-page) · 자주 묻는 질문(faq-page)이 같이 쓴다.
// 기준: docs/ux/document-pages.md, 차이 목록 docs/ux/pages/_diff-document-pages.md(C1~C10), 모양 design-rules 14·28절.

/** 찾은 낱말에 <mark> — 낱말이 없으면 글자 그대로 */
export function Marked({ text, words }: { text: string; words: readonly string[] }) {
  if (words.length === 0) return <>{text}</>;
  return (
    <>
      {markParts(text, words).map((p, i) =>
        p.hit ? (
          <mark key={i} className={s.mark}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** 탭 줄 — 약관 세 글 · 안내 글 다섯이 같은 알약 모양(14절) */
export type DocTabs = { label: string; current: string; items: readonly { key: string; href: string; name: string }[] };

export function DocTabRow({ tabs }: { tabs: DocTabs }) {
  return (
    <nav className={s.tabs} aria-label={tabs.label}>
      {tabs.items.map((t) => (
        <Link key={t.key} href={t.href} className={s.tab} aria-current={t.key === tabs.current ? "page" : undefined}>
          {t.name}
        </Link>
      ))}
    </nav>
  );
}

export function FrequentBadge() {
  return <span className={s.badge}>주요</span>;
}

/** 쉬운 말 요약 판 — 줄마다 갈 조가 있으면 그 조로 가는 링크(원칙 ④). 문장은 그대로 */
export function DocSummary({
  heading,
  lines,
  targets,
  onGo,
}: {
  heading: string;
  lines: readonly string[];
  targets: readonly (string | null)[];
  onGo: (id: string) => void;
}) {
  return (
    <div className={s.summary}>
      <h2 className={s.summaryT}>{heading}</h2>
      <ol className={s.summaryList}>
        {lines.map((line, i) => {
          const id = targets[i] ?? null;
          return (
            <li key={line}>
              {id ? (
                <a
                  className={s.summaryLink}
                  href={`#${id}`}
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    e.preventDefault();
                    onGo(id);
                  }}
                >
                  {line}
                </a>
              ) : (
                <span>{line}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** 「조가」·「질문이」 — 받침이 있으면 「이」 */
function subjectMark(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? "이" : "가";
}

/** 검색칸 — 낱말로 조를 찾고 다음·이전으로 오간다(원칙 ① · 기준 3). Enter 는 다음 */
export function DocSearch({
  query,
  onQuery,
  count,
  unit,
  onStep,
  inputRef,
}: {
  query: string;
  onQuery: (q: string) => void;
  count: number;
  /** 「조」·「질문」 — 찾은 개수 문장의 단위 */
  unit: string;
  onStep: (dir: 1 | -1) => void;
  /** 목차 줄의 「찾기」가 초점을 옮길 자리 */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const searching = query.trim().length > 0;
  return (
    <form
      role="search"
      className={s.search}
      onSubmit={(e) => {
        e.preventDefault();
        onStep(1);
      }}
    >
      <label htmlFor={id} className="sr-only">
        이 글에서 찾기
      </label>
      <div className={s.searchRow}>
        <span className={s.searchBox}>
          <svg className={s.searchIcon} viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m13.5 13.5 3.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            id={id}
            className={s.searchInput}
            type="search"
            value={query}
            placeholder="이 글에서 찾기"
            autoComplete="off"
            onChange={(e) => onQuery(e.target.value)}
          />
        </span>
        {searching && count > 0 ? (
          <span className={s.stepBtns}>
            <button type="button" className={s.stepBtn} onClick={() => onStep(-1)}>
              이전
            </button>
            <button type="button" className={s.stepBtn} onClick={() => onStep(1)}>
              다음
            </button>
          </span>
        ) : null}
      </div>
      <p className={s.searchCount} aria-live="polite">
        {!searching ? "" : count > 0 ? `${count}개 ${unit}에서 발견` : `찾는 낱말이 있는 ${unit}${subjectMark(unit)} 없어요.`}
      </p>
    </form>
  );
}

/** 목차 줄의 「찾기」 — 검색칸을 화면에 들이고 초점. 움직임 줄이기면 base.css 가 스크롤을 바로 옮긴다 */
export function focusSearch(input: HTMLInputElement | null) {
  if (!input) return;
  input.scrollIntoView?.({ block: "center" });
  input.focus({ preventScroll: true });
}

/** 분류 칩 — 「전체」 기본, 고르면 그 분류만 남긴다(원칙 ② · 기준 4). 분류가 없는 글은 부르는 쪽이 그리지 않는다 */
export function DocChips({
  tags,
  active,
  onPick,
  label = "분류",
}: {
  tags: readonly string[];
  active: string | null;
  onPick: (tag: string | null) => void;
  /** 같은 칩 줄이 펼친 목차 안에 하나 더 있을 때 낭독기가 구분하는 이름 */
  label?: string;
}) {
  return (
    <div className={s.chipRow} role="group" aria-label={label}>
      {[null, ...tags].map((t) => (
        <button key={t ?? ""} type="button" className={s.filterChip} aria-pressed={active === t} onClick={() => onPick(t)}>
          {t ?? "전체"}
        </button>
      ))}
    </div>
  );
}

/** 조 주소 복사(원칙 ⑤ · 기준 7) — 지금 주소(검색어 포함) 끝에 #조id. 「복사됨」은 2초 */
export function CopyAnchor({ id, title }: { id: string; title: string }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const show = (text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 2000);
  };
  return (
    <span className={s.copy}>
      <button
        type="button"
        className={s.copyBtn}
        aria-label={`「${title}」 주소 복사`}
        title="주소 복사"
        onClick={() => {
          const { origin, pathname, search } = window.location;
          const url = `${origin}${pathname}${search}#${id}`;
          // http 주소·오래된 브라우저에는 navigator.clipboard 가 없다
          if (!navigator.clipboard) {
            show("복사하지 못했어요");
            return;
          }
          navigator.clipboard.writeText(url).then(
            () => show("복사됨"),
            () => show("복사하지 못했어요"),
          );
        }}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span className={s.copied} role="status">
        {message}
      </span>
    </span>
  );
}
