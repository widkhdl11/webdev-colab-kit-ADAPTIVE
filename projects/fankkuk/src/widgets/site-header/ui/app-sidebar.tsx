"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/features/auth/ui/logout-button";
import { LogoMark } from "@/shared/ui/logo";
import { ACCOUNT_MENU, BADGE_SPEECH, currentMenuItem, type AppBadge, type AppMenuGroup } from "../model/app-menu";
import { Icon } from "./app-icons";

// 로그인 후 왼쪽 앱 사이드바(design-rules 00절, 시안 v18/home-fan.html·home-creator.html·v18-app.css).
// 펼침 240 / 접힘 64 — 본문을 가리지 않고 그 폭만큼 민다(body 왼쪽 여백, site-header.css). 768 이하는 위 막대 + 서랍.
// 접힘 여부는 localStorage "sidebar-collapsed"(저장값 우선, 없으면 펼침). 첫 그림이 깜빡이지 않게
// app/layout.tsx 의 짧은 스크립트가 그리기 전에 <html data-collapsed> 를 먼저 단다. `[` 키로 접고 편다.

const KEY = "sidebar-collapsed";

function narrowNow(): boolean {
  return window.matchMedia("(max-width: 768px)").matches;
}

export type AppSidebarProps = {
  role: "fan" | "creator";
  groups: readonly AppMenuGroup[];
  current?: string;
  homeHref: string;
  nickname: string;
  /** 메뉴 칸 옆 숫자 — 0 이면 붙이지 않는다 */
  counts: Partial<Record<AppBadge, number>>;
};

export function AppSidebar({ role, groups, current, homeHref, nickname, counts }: AppSidebarProps) {
  const [collapsed, setCollapsedState] = useState(false);
  const [open, setOpenState] = useState(false);
  const markRef = useRef<HTMLButtonElement>(null);
  const foldRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const roleLabel = role === "fan" ? "팬" : "크리에이터";
  const here = currentMenuItem(groups, current);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    if (v) document.documentElement.setAttribute("data-collapsed", "1");
    else document.documentElement.removeAttribute("data-collapsed");
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      // 저장이 막힌 브라우저(사생활 보호 창 등)에서는 이번 화면에서만 유지한다
    }
  }, []);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    if (v) document.documentElement.setAttribute("data-open", "1");
    else document.documentElement.removeAttribute("data-open");
  }, []);

  // 그리기 전 스크립트가 단 값을 읽어 버튼 상태(aria-expanded)를 맞춘다
  useEffect(() => {
    setCollapsedState(document.documentElement.getAttribute("data-collapsed") === "1");
  }, []);

  // 서랍이 열린 채 넓은 폭으로 바뀌면 닫는다. 서랍이 떠 있는 동안 뒤 페이지가 스크롤되지 않게
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("no-scroll");
    const onResize = () => {
      if (!narrowNow()) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("resize", onResize);
    };
  }, [open, setOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (accountRef.current?.open) accountRef.current.open = false;
        if (open) {
          setOpen(false);
          openRef.current?.focus();
        }
        return;
      }
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "[" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing && !narrowNow()) setCollapsed(!collapsed);
    };
    const onDocClick = (e: MouseEvent) => {
      const d = accountRef.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDocClick);
    };
  }, [open, collapsed, setOpen, setCollapsed]);

  // 페이지를 떠나면 서랍을 닫는다(다음 화면의 사이드바는 새로 그려지지만 html 속성은 남는다)
  useEffect(() => () => document.documentElement.removeAttribute("data-open"), []);

  return (
    <>
      <header className="topbar">
        <Link className="logo" href={homeHref} aria-label="팬꾹 홈">
          <LogoMark size={28} />
          팬꾹
        </Link>
        <button
          ref={openRef}
          className="icon-btn"
          type="button"
          aria-label="메뉴 열기"
          aria-expanded={open}
          aria-controls="app-sidebar"
          onClick={() => {
            setOpen(true);
            closeRef.current?.focus();
          }}
        >
          <Icon name="menu" />
        </button>
      </header>
      <aside className="sidebar" id="app-sidebar" aria-label={`${roleLabel} 메뉴`}>
        <div className="sb-top">
          <button
            ref={markRef}
            className="sb-mark"
            type="button"
            aria-label="사이드바 펼치기"
            aria-controls="app-sidebar"
            aria-expanded={!collapsed}
            onClick={() => {
              setCollapsed(false);
              foldRef.current?.focus();
            }}
          >
            <span className="m-txt" aria-hidden="true">
              <LogoMark size={28} />
            </span>
            <Icon name="panel-left-open" className="m-ico" />
          </button>
          <Link className="logo" href={homeHref} aria-label="팬꾹 홈">
            <LogoMark size={28} />
            팬꾹
          </Link>
          <button
            ref={foldRef}
            className="sb-btn sb-fold"
            type="button"
            aria-label="사이드바 접기"
            aria-controls="app-sidebar"
            onClick={() => {
              setCollapsed(true);
              markRef.current?.focus();
            }}
          >
            <Icon name="panel-left-close" />
          </button>
          <button
            ref={closeRef}
            className="sb-btn sb-close"
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => {
              setOpen(false);
              openRef.current?.focus();
            }}
          >
            <Icon name="x" />
          </button>
        </div>
        <nav className="sb-nav" aria-label={`${roleLabel} 메뉴`}>
          {groups.map((g, gi) => {
            const gid = `sb-g${gi}`;
            return (
              <div key={g.label}>
                <p className="sb-group" id={gid}>
                  <span className="sb-group-t">{g.label}</span>
                </p>
                <ul aria-labelledby={gid}>
                  {g.items.map((it) => {
                    const n = it.badge ? (counts[it.badge] ?? 0) : 0;
                    return (
                      <li key={it.label}>
                        <Link
                          href={it.href}
                          data-tip={it.label}
                          aria-current={here === it ? "page" : undefined}
                          onClick={() => {
                            if (open) setOpen(false);
                          }}
                        >
                          <Icon name={it.icon} />
                          <span className="sb-label">{it.label}</span>
                          {n > 0 ? (
                            <>
                              {/* 역할 없는 span 의 aria-label 은 낭독기가 대부분 읽지 않는다 — 숫자는 숨기고 뜻을 sr-only 로 */}
                              <span className="badge" aria-hidden="true">
                                {n}
                              </span>
                              {/* 칸 이름과 뜻 사이를 끊어 읽게 쉼표 — 「처리할 일, 3건」 */}
                              <span className="sr-only">{it.badge ? `, ${BADGE_SPEECH[it.badge](n)}` : null}</span>
                            </>
                          ) : null}
                        </Link>
                        {it.sub ? (
                          // 하위 줄은 늘 펼쳐 둔다(design-rules 11절). 접힘(64)에서는 css 가 숨기고 부모 아이콘만 남긴다
                          <ul className="sb-sub" aria-label={`${it.label} 방식`}>
                            {it.sub.map((sub) =>
                              "soon" in sub ? (
                                <li key={sub.label}>
                                  <span className="sb-soon">
                                    <span className="sb-label">{sub.label}</span>
                                    {/* 낭독기가 「합포장준비 중」으로 붙여 읽지 않게 */}
                                    <span className="sr-only">, </span>
                                    <span className="sb-soon-tag">준비 중</span>
                                  </span>
                                </li>
                              ) : (
                                <li key={sub.label}>
                                  <Link
                                    href={sub.href}
                                    data-tip={sub.label}
                                    onClick={() => {
                                      if (open) setOpen(false);
                                    }}
                                  >
                                    <span className="sb-label">{sub.label}</span>
                                  </Link>
                                </li>
                              ),
                            )}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="sb-bottom">
          <details className="sb-menu" ref={accountRef}>
            <summary aria-label={`${nickname}님 계정 메뉴`}>
              <span className="sb-avatar" aria-hidden="true">
                {Array.from(nickname)[0] ?? roleLabel[0]}
              </span>
              <span className="sb-name">{nickname}님</span>
              <Icon name="chevrons-up-down" className="sb-chev" />
            </summary>
            <div className="sb-menu-list">
              {/* 크리에이터의 계정 설정은 위 「설정」과 같은 화면이라, 위 메뉴에서 현재 칸이 잡혔으면 여기는 켜지 않는다(한 화면에 현재 표시 하나) */}
              {ACCOUNT_MENU[role].map((link) => (
                <Link key={link.href} href={link.href} aria-current={here === null && current === link.href ? "page" : undefined}>
                  {link.label}
                </Link>
              ))}
              <LogoutButton className="menu-action" />
            </div>
          </details>
        </div>
      </aside>
      <div
        className="sb-scrim"
        aria-hidden="true"
        onClick={() => {
          setOpen(false);
          openRef.current?.focus();
        }}
      />
    </>
  );
}
