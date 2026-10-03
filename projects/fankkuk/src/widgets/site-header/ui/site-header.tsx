"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { HeaderGiftState } from "@/entities/order/ui/fan-stage-copy";
import { LogoutButton } from "@/features/auth/ui/logout-button";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { LogoMark } from "@/shared/ui/logo";

// 사이트 헤더 세 상태(design-rules 5절). 같은 구조에 오른쪽 끝만 다르다.
// 시안: docs/design/mockups/site/v4/landing.html(비로그인) · home.html(팬) · creator-requests.html(크리에이터)

export type HeaderGift = { orderNo: string; creatorName: string; state: HeaderGiftState; label: string };

type NavItem = { href: string; label: string };

const FAN_NAV: NavItem[] = [
  { href: "/creators", label: "크리에이터 찾기" },
  { href: "/gifts/new", label: "선물 보내기" },
  { href: "/notices", label: "공지사항" },
  { href: "/about", label: "팬꾹 소개" },
  { href: "/support", label: "고객센터" },
];

const CREATOR_NAV: NavItem[] = [
  { href: "/creator/requests", label: "승인 요청" },
  { href: "/creator/log", label: "열람 기록" },
  { href: "/creator/settings", label: "주소와 설정" },
  { href: "/notices", label: "공지사항" },
  { href: "/support", label: "고객센터" },
];

const FAN_MENU: NavItem[] = [
  { href: "/me", label: "내 정보" },
  { href: "/me/following", label: "팔로우한 크리에이터" },
  { href: "/gifts", label: "선물 내역" },
];

const CREATOR_MENU: NavItem[] = [{ href: "/creator/settings", label: "주소와 설정" }];

/** 헤더에 아이콘으로 보이는 선물 수. 넘치면 「+N」. */
const MAX_ICONS = 3;

export type SiteHeaderProps =
  | { role: "guest"; current?: string }
  | { role: "fan"; current?: string; nickname: string; gifts: HeaderGift[] }
  | { role: "creator"; current?: string; nickname: string; pendingCount: number };

function GiftGlyph({ state, size = 24, hole = "var(--gi-hole)" }: { state: HeaderGiftState; size?: number; hole?: string }) {
  if (state === "wait") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M5 2h14v5a6 6 0 0 1-2.4 4.8L14.5 12l2.1.2A6 6 0 0 1 19 17v5H5v-5a6 6 0 0 1 2.4-4.8L9.5 12l-2.1-.2A6 6 0 0 1 5 7V2Z"
        />
        <path d="M8 5h8v2a4 4 0 0 1-4 4 4 4 0 0 1-4-4V5Z" fill={hole} />
      </svg>
    );
  }
  if (state === "done") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="5" width="13" height="11" rx="3" fill="currentColor" />
      <path d="M15 9h4l4 4v3a2 2 0 0 1-2 2h-6V9Z" fill="currentColor" />
      <circle cx="7" cy="18.5" r="3" fill="currentColor" stroke={hole} strokeWidth="2" />
      <circle cx="18" cy="18.5" r="3" fill="currentColor" stroke={hole} strokeWidth="2" />
    </svg>
  );
}

function Caret() {
  return (
    <svg className="caret" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 마우스 올림·포커스 둘 다 말풍선을 띄운다. 화면 밖으로 나가면 안쪽으로 민다. Esc 로 닫힌다. */
function TipItem({ tip, children }: { tip: string; children: (tipId: string) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const tipId = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open || !ref.current) return;
    setShift(0);
    const r = ref.current.getBoundingClientRect();
    const over = r.right - (window.innerWidth - 8);
    const under = 8 - r.left;
    setShift(over > 0 ? -over : under > 0 ? under : 0);
  }, [open]);

  return (
    <li
      className="gift-item"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {children(tipId)}
      <span
        ref={ref}
        className={open ? "tip is-open" : "tip"}
        role="tooltip"
        id={tipId}
        style={shift ? { transform: `translateX(calc(-50% + ${shift}px))` } : undefined}
      >
        <span className="tip-body">{tip}</span>
      </span>
    </li>
  );
}

function GiftStatus({ gifts }: { gifts: HeaderGift[] }) {
  const total = gifts.length;
  const tipOf = (g: HeaderGift, i: number) => `선물 ${total}개 중 ${i + 1}번째 · ${g.creatorName}님께 · ${g.label}`;
  const shown = gifts.slice(0, MAX_ICONS);
  const rest = gifts.slice(MAX_ICONS);
  return (
    <ul className="gift-status" aria-label={`진행 중인 선물 ${total}개`}>
      {shown.map((g, i) => (
        <TipItem key={g.orderNo} tip={tipOf(g, i)}>
          {(tipId) => (
            <Link
              className="gift-icon"
              data-state={g.state}
              href={`/gifts/${g.orderNo}`}
              aria-label={`${g.creatorName}님께 보낸 선물`}
              aria-describedby={tipId}
            >
              <GiftGlyph state={g.state} />
            </Link>
          )}
        </TipItem>
      ))}
      {rest.length > 0 ? (
        <TipItem tip={rest.map((g, i) => tipOf(g, i + MAX_ICONS)).join(" / ")}>
          {(tipId) => (
            <Link className="gift-more" href="/gifts" aria-label={`선물 ${rest.length}개 더 보기`} aria-describedby={tipId}>
              +{rest.length}
            </Link>
          )}
        </TipItem>
      ) : null}
    </ul>
  );
}

/** 767px 이하 — 「선물 N」 배지가 여는 바텀시트. 공용 확인 창(BottomSheet)의 모달 모드라 포커스가 시트 안에서만 돌고 Esc 로 닫힌다. */
function GiftSheet({ gifts, open, onClose }: { gifts: HeaderGift[]; open: boolean; onClose: () => void }) {
  // 시트가 떠 있는 동안 뒤 페이지가 스크롤되지 않게
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, [open]);

  return (
    <BottomSheet open={open} title={`진행 중인 선물 ${gifts.length}개`} onClose={onClose}>
      <ul className="sheet-list">
        {gifts.map((g) => (
          <li key={g.orderNo}>
            <Link href={`/gifts/${g.orderNo}`} onClick={onClose}>
              <span className="gift-icon" data-state={g.state}>
                <GiftGlyph state={g.state} />
              </span>
              <span>
                <strong>{g.creatorName}님께</strong>
                <small>{g.label}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link className="btn btn--soft btn--block sheet-all" href="/gifts" onClick={onClose}>
        선물 내역 전체 보기
      </Link>
    </BottomSheet>
  );
}

function UserMenu({ nickname, roleLabel, items }: { nickname: string; roleLabel: string; items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div
      className="user-menu"
      ref={ref}
      // 펼치기 버튼 방식(메뉴 역할 아님) — Tab 으로 패널 밖으로 나가면 닫는다
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          btnRef.current?.focus();
        }
      }}
    >
      <button
        ref={btnRef}
        className="user-btn"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar" aria-hidden="true">
          {nickname.slice(0, 1)}
        </span>
        <span className="nick">{nickname}</span>
        <Caret />
      </button>
      {/* tabIndex -1: 패널 안을 눌러도 포커스가 패널에 머물러 onBlur 가 닫지 않게(포커스를 옮기지 않는 브라우저 대비) */}
      <div className="user-dropdown" id={panelId} hidden={!open} tabIndex={-1}>
        <p className="who">
          {nickname}님 · {roleLabel}
        </p>
        {items.map((it) => (
          <Link key={it.href} href={it.href}>
            {it.label}
          </Link>
        ))}
        <hr />
        <LogoutButton className="menu-action" />
      </div>
    </div>
  );
}

export function SiteHeader(props: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth > 767) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  const nav = props.role === "creator" ? CREATOR_NAV : FAN_NAV;
  const logoHref = props.role === "guest" ? "/" : props.role === "fan" ? "/home" : "/creator/requests";
  const logoLabel = props.role === "guest" ? "팬꾹 처음 화면" : props.role === "fan" ? "팬꾹 메인" : "팬꾹 크리에이터 처음 화면";
  const navLink = (it: NavItem) => (
    <Link href={it.href} aria-current={props.current === it.href ? "page" : undefined}>
      {it.label}
    </Link>
  );

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="logo" href={logoHref} aria-label={logoLabel}>
          <LogoMark />
          팬꾹
        </Link>
        <nav className="nav" aria-label="주요 메뉴">
          <ul>
            {nav.map((it) => (
              <li key={it.href}>{navLink(it)}</li>
            ))}
          </ul>
        </nav>
        <div className="header-actions">
          {props.role === "guest" ? (
            <>
              <Link className="btn btn--text btn--sm hide-sm" href="/login" aria-current={props.current === "/login" ? "page" : undefined}>
                로그인
              </Link>
              <Link className="btn btn--sm hide-sm" href="/signup" aria-current={props.current === "/signup" ? "page" : undefined}>
                회원가입
              </Link>
            </>
          ) : null}
          {props.role === "fan" && props.gifts.length > 0 ? (
            <>
              <GiftStatus gifts={props.gifts} />
              <button
                className="gift-badge"
                type="button"
                aria-haspopup="dialog"
                onClick={() => setSheetOpen(true)}
              >
                <span className="glyph" aria-hidden="true">
                  <GiftGlyph state="move" size={18} hole="var(--brand)" />
                </span>
                선물 {props.gifts.length}
              </button>
            </>
          ) : null}
          {props.role === "creator" ? (
            <Link className="req-pill" href="/creator/requests" aria-label={`승인 대기 ${props.pendingCount}건`}>
              <span className="glyph" aria-hidden="true">
                <GiftGlyph state="wait" size={16} hole="var(--brand)" />
              </span>
              대기 {props.pendingCount}건
            </Link>
          ) : null}
          {props.role === "fan" ? <UserMenu nickname={props.nickname} roleLabel="팬" items={FAN_MENU} /> : null}
          {props.role === "creator" ? <UserMenu nickname={props.nickname} roleLabel="크리에이터" items={CREATOR_MENU} /> : null}
          <button
            ref={toggleRef}
            className="menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="3" rx="1.5" fill="currentColor" />
              <rect x="3" y="10.5" width="18" height="3" rx="1.5" fill="currentColor" />
              <rect x="3" y="16" width="18" height="3" rx="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mobile-menu" id={menuId} hidden={!menuOpen}>
        {nav.map((it) => (
          <Link key={it.href} href={it.href} aria-current={props.current === it.href ? "page" : undefined}>
            {props.role === "creator" && it.href === "/creator/requests" ? `${it.label} (대기 ${props.pendingCount}건)` : it.label}
          </Link>
        ))}
        {props.role === "guest" ? (
          <div className="btn-row">
            <Link className="btn btn--line" href="/login">
              로그인
            </Link>
            <Link className="btn" href="/signup">
              회원가입
            </Link>
          </div>
        ) : null}
        {props.role === "fan" ? (
          <>
            <p className="group-label">내 정보 · {props.nickname}님</p>
            {FAN_MENU.map((it) => (
              <Link key={it.href} href={it.href}>
                {it.label}
              </Link>
            ))}
          </>
        ) : null}
        {props.role !== "guest" ? <LogoutButton className="menu-action" /> : null}
      </div>
      {props.role === "fan" && props.gifts.length > 0 ? (
        <GiftSheet gifts={props.gifts} open={sheetOpen} onClose={() => setSheetOpen(false)} />
      ) : null}
    </header>
  );
}
