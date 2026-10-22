"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findIds, queryWords, type NavItem } from "../model/doc-nav";

// 문서형 페이지의 찾기 상태 — 검색 · 분류 칩 · 지금 읽는 조 · 조로 가기(docs/ux/document-pages.md 원칙 ①②, 기준 1·3·4).
// 조로 갈 때 칩에 가려진 조면 「전체」로 되돌린 뒤 간다 — 주소(#조id)·목차·요약·검색 어디서 와도 같다.

type GoOptions = {
  /** 간 뒤 조 제목으로 키보드 초점을 옮긴다(목차·요약 링크). 검색의 다음·이전은 검색칸에 초점을 남긴다 */
  focus?: boolean;
  /** 주소 끝(#조id)을 방문 기록에 남긴다. 검색의 다음·이전·주소로 들어온 경우는 바꾸기만 한다 */
  push?: boolean;
};

export type DocNav = {
  query: string;
  setQuery: (q: string) => void;
  words: readonly string[];
  matches: readonly string[];
  /** 다음·이전으로 지금 보고 있는 찾은 칸의 차례(-1 = 아직 안 감) */
  matchIndex: number;
  step: (dir: 1 | -1) => void;
  tag: string | null;
  setTag: (tag: string | null) => void;
  hidden: ReadonlySet<string>;
  current: string | null;
  goTo: (id: string, opts?: GoOptions) => void;
};

/**
 * @param reveal 조에 갈 때 그 칸을 펼치는 일(자주 묻는 질문의 접힌 답). 약관·안내 글은 넘기지 않는다
 */
export function useDocNav(items: readonly NavItem[], reveal?: (el: HTMLElement) => void): DocNav {
  // 배열은 그릴 때마다 새로 생기므로 이어 붙인 글자로 효과를 다시 걸지 정한다
  const idKey = items.map((i) => i.id).join(" ");
  const [query, setQueryState] = useState("");
  const [matchIndex, setMatchIndex] = useState(-1);
  const [tag, setTag] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(items[0]?.id ?? null);
  const [pending, setPending] = useState<({ id: string } & GoOptions) | null>(null);
  const revealRef = useRef(reveal);
  useEffect(() => {
    revealRef.current = reveal;
  }, [reveal]);

  const words = useMemo(() => queryWords(query), [query]);
  const matches = useMemo(() => findIds(items, words), [items, words]);
  const tagsOf = useMemo(() => new Map(items.map((i) => [i.id, i.tags])), [items]);
  const hidden = useMemo(
    () => new Set(tag === null ? [] : items.filter((i) => !i.tags.includes(tag)).map((i) => i.id)),
    [items, tag],
  );

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setMatchIndex(-1);
  }, []);

  const goTo = useCallback(
    (id: string, opts: GoOptions = {}) => {
      if (!tagsOf.has(id)) return;
      // 가린 조로 가면 칩을 「전체」로 — 칩에 맞는 조면 칩은 그대로 둔다
      setTag((t) => (t !== null && !(tagsOf.get(id) ?? []).includes(t) ? null : t));
      setPending({ id, ...opts });
    },
    [tagsOf],
  );

  // 칩을 되돌린 그림이 그려진 뒤에 움직인다 — 가려진(hidden) 채로는 자리가 없다
  useEffect(() => {
    if (!pending) return;
    const el = document.getElementById(pending.id);
    if (!el || el.hidden) return;
    revealRef.current?.(el);
    // behavior 를 주지 않으면 페이지의 scroll-behavior 를 따른다 — 움직임 줄이기면 base.css 가 auto 로 바꾼다
    el.scrollIntoView?.({ block: "start" });
    const hash = `#${pending.id}`;
    if (window.location.hash !== hash) {
      if (pending.push) window.history.pushState(null, "", hash);
      else window.history.replaceState(null, "", hash);
    }
    if (pending.focus) el.querySelector<HTMLElement>("[data-doc-heading]")?.focus({ preventScroll: true });
    setCurrent(pending.id);
    setPending(null);
  }, [pending, hidden]);

  // 주소(#조id)로 들어오거나 글 안 링크로 주소 끝이 바뀌면 그 조로 — 가려졌으면 펼친다
  useEffect(() => {
    const ids = new Set(idKey.split(" "));
    const onHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (ids.has(id)) goTo(id);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [idKey, goTo]);

  // 지금 읽는 조 — 화면 위쪽 1/3 안에 머리가 들어온 마지막 보이는 조. 스크롤 이벤트는 그리기 한 번에 한 번만 잰다
  useEffect(() => {
    const ids = idKey.split(" ");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight / 3;
      let found: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el || el.hidden) continue;
        if (found === null || el.getBoundingClientRect().top <= line) found = id;
        else break;
      }
      setCurrent(found);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [idKey, hidden]);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (matches.length === 0) return;
      const next = matchIndex < 0 ? (dir === 1 ? 0 : matches.length - 1) : (matchIndex + dir + matches.length) % matches.length;
      setMatchIndex(next);
      goTo(matches[next]!);
    },
    [matches, matchIndex, goTo],
  );

  return { query, setQuery, words, matches, matchIndex, step, tag, setTag, hidden, current, goTo };
}
