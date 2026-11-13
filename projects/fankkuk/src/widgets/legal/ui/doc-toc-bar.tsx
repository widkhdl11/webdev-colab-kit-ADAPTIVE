"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TocGroup } from "../model/doc-nav";
import { DocChips, FrequentBadge } from "./doc-parts";
import s from "./doc-page.module.css";

// 화면 위에 붙는 목차 줄(D1 ②). 높이 44. 옆 목차(DocSideToc, 아래)를 쓰는 화면은 그게 보이는 넓은 폭에서 이 줄을 숨긴다.
// 「지금 읽는 조 이름」 + 「목차 열기」. 펼치면 전체 조 · 지금 조 강조(aria-current) · 「주요」 · 약관의 주제 묶음 제목.
// 칩으로 가린 조는 흐리게 남고, 누르면 「전체」로 돌아가 그 조를 보인다. Esc · 바깥 누름으로 닫히고 초점은 「목차 열기」로.
// 글 가운데서도 수단이 둘 이상이게(원칙 ①) 「찾기」 단추(검색칸으로 옮겨 초점) · 펼친 목록 맨 위 분류 칩을 둔다 — 줄 높이 44 는 그대로.

type Props = {
  groups: readonly TocGroup[];
  current: string | null;
  hidden: ReadonlySet<string>;
  frequent: ReadonlySet<string>;
  onGo: (id: string) => void;
  /** 「찾기」 — 검색칸으로 옮겨 초점을 준다 */
  onFind: () => void;
  /** 분류 칩 — 분류가 있는 글만. 펼친 목록 맨 위에 같은 칩 줄 */
  chips?: { tags: readonly string[]; active: string | null; onPick: (tag: string | null) => void };
};

export function DocTocBar({ groups, current, hidden, frequent, onGo, onFind, chips }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();
  const items = groups.flatMap((g) => g.items);
  const now = items.find((i) => i.id === current) ?? items[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btnRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (!wrap || wrap.contains(e.target as Node)) return;
      // 초점이 목차 안에 있었을 때만 「목차 열기」로 돌린다 — 바깥의 검색칸 등을 누른 초점은 빼앗지 않는다
      const focusInside = wrap.contains(document.activeElement);
      setOpen(false);
      if (focusInside) btnRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // 펼친 목록이 화면보다 길면 목록 칸 안에서 스크롤된다 — 지금 조 줄이 보이게 칸만 움직인다(페이지는 그대로)
  useEffect(() => {
    const panel = panelRef.current;
    const link = panel?.querySelector<HTMLElement>("[aria-current]");
    if (!open || !panel || !link) return;
    const top = link.offsetTop - panel.offsetTop;
    if (top < panel.scrollTop || top + link.offsetHeight > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = Math.max(0, top - panel.clientHeight / 2);
    }
  }, [open, current]);

  if (!now) return null;

  return (
    <div ref={wrapRef} className={s.bar}>
      <div className={s.barRow}>
        <p className={s.barNow} title={now.label}>
          {now.label}
        </p>
        <button type="button" className={s.barBtn} onClick={onFind}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m13.5 13.5 3.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          찾기
        </button>
        <button
          ref={btnRef}
          type="button"
          className={s.barBtn}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "목차 닫기" : "목차 열기"}
          <svg className={s.chev} viewBox="0 0 20 20" aria-hidden="true">
            <path d="m4 7.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <nav ref={panelRef} id={panelId} className={s.panel} aria-label="목차" hidden={!open}>
        {chips && chips.tags.length > 0 ? <DocChips label="목차 분류" tags={chips.tags} active={chips.active} onPick={chips.onPick} /> : null}
        {groups.map((g, gi) => (
          <div key={g.title ?? `rest-${gi}`} className={s.tocGroup}>
            {g.title ? <p className={s.tocGroupT}>{g.title}</p> : null}
            {g.items.map((item) => (
              <a
                key={item.id}
                className={`${s.tocLink}${hidden.has(item.id) ? ` ${s.dim}` : ""}`}
                href={`#${item.id}`}
                aria-current={item.id === now.id ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  onGo(item.id);
                }}
              >
                <span className={s.tocLabel}>{item.label}</span>
                {frequent.has(item.id) ? <FrequentBadge /> : null}
              </a>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

// 옆 목차(design-rules 28절, 2026-11-12 사용자 승인 — 시안 guide-fan-r2 · faq-20261112). 본문 880 밖 오른쪽 여백에 폭 200, 스크롤을 따라온다.
// 보이는 폭은 CSS 가 정한다: 로그인 전 화면 1376 이상, 로그인 후 1400 이상. 그때는 위에 붙는 목차 줄을 숨기고, 더 좁으면 이 목차가 숨는다.
// 목차 줄의 펼친 목록과 같은 줄 모양 — 지금 조 하늘 면(aria-current) · 「주요」 · 칩으로 가린 조는 흐리게 · 약관식 묶음 제목.

type SideProps = Omit<Props, "onFind" | "chips">;

export function DocSideToc({ groups, current, hidden, frequent, onGo }: SideProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const items = groups.flatMap((g) => g.items);
  const now = items.find((i) => i.id === current) ?? items[0];

  // 목차가 화면보다 길면 칸 안에서 스크롤된다 — 지금 조 줄이 보이게 칸만 움직인다(페이지는 그대로)
  useEffect(() => {
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>("[aria-current]");
    if (!list || !link || list.clientHeight === 0) return;
    const top = link.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + link.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 2);
    }
  }, [current]);

  if (!now) return null;

  return (
    <nav className={s.side} aria-label="목차 (옆)">
      <div ref={listRef} className={s.sideIn}>
        <p className={s.sideH}>목차</p>
        {groups.map((g, gi) => (
          <div key={g.title ?? `rest-${gi}`} className={s.tocGroup}>
            {g.title ? <p className={s.tocGroupT}>{g.title}</p> : null}
            {g.items.map((item) => (
              <a
                key={item.id}
                className={`${s.tocLink}${hidden.has(item.id) ? ` ${s.dim}` : ""}`}
                href={`#${item.id}`}
                aria-current={item.id === now.id ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onGo(item.id);
                }}
              >
                <span className={s.tocLabel}>{item.label}</span>
                {frequent.has(item.id) ? <FrequentBadge /> : null}
              </a>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
