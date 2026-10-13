"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { HeaderGiftState } from "@/entities/order/ui/fan-stage-copy";
import { CREATOR_HOME, FAN_HOME } from "@/entities/session/model/home-path";
import { CREATOR_MY_MENU, FAN_MY_MENU, MY_PAGE_TITLE } from "@/entities/session/model/my-menu";
import { LogoutButton } from "@/features/auth/ui/logout-button";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { LogoMark } from "@/shared/ui/logo";

// 사이트 헤더 세 상태(design-rules 5절·0절). 같은 구조에 오른쪽 끝만 다르다. 1100px 이하는 메뉴를 접는다.
// 시안(재디자인 v11): docs/design/mockups/site/v11/landing.html(비로그인) · home-fan.html(팬) · home-creator.html(크리에이터)

export type HeaderGift = { orderNo: string; creatorName: string; state: HeaderGiftState; label: string };

type NavItem = { href: string; label: string };

// 손님·팬·크리에이터가 같은 가로 메뉴를 쓴다. 크리에이터도 다른 크리에이터를 찾아 선물을 보낸다(2026-10-04 사용자 「크리에이터도 일반 팬처럼 크리에이터 찾기 같은거 보여야하지 않나」).
// 크리에이터의 일하는 화면(승인 요청·보낸 역조공·열람 기록·주소와 설정)은 「내 팬꾹」 왼쪽 메뉴에만 있다.
const SITE_NAV: NavItem[] = [
  { href: "/creators", label: "크리에이터 찾기" },
  { href: "/gifts/new", label: "선물 보내기" },
  { href: "/notices", label: "공지사항" },
  { href: "/about", label: "팬꾹 소개" },
  { href: "/support", label: "고객센터" },
];

/** 헤더에 아이콘으로 보이는 선물 수. 넘치면 「+N」. */
const MAX_ICONS = 3;

export type SiteHeaderProps =
  | { role: "guest"; current?: string }
  | { role: "fan"; current?: string; nickname: string; gifts: HeaderGift[] }
  | { role: "creator"; current?: string; nickname: string; pendingCount: number };

// 가는 선 그림(시안 v9-header). 상태 색은 그림이 아니라 .gift-icon 의 작은 점이 맡는다.
function LineIcon({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function GiftGlyph({ state, size = 24 }: { state: HeaderGiftState; size?: number }) {
  if (state === "wait") {
    return (
      <LineIcon size={size}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </LineIcon>
    );
  }
  if (state === "done") {
    return (
      <LineIcon size={size}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12 2.5 2.5 5-5" />
      </LineIcon>
    );
  }
  return (
    <LineIcon size={size}>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </LineIcon>
  );
}

/** 상자 그림 — 접힌 헤더의 「선물 N」·크리에이터 「승인 대기 N」 앞 */
function BoxGlyph({ size = 24 }: { size?: number }) {
  return (
    <LineIcon size={size}>
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
      <path d="M12 22V12" />
      <path d="m3.3 7 8.7 5 8.7-5" />
    </LineIcon>
  );
}

function Caret() {
  return (
    <svg className="caret" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

/** 1100px 이하 — 「선물 N」 배지가 여는 바텀시트. 공용 확인 창(BottomSheet)의 모달 모드라 포커스가 시트 안에서만 돌고 Esc 로 닫힌다. */
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

function UserMenu({ nickname, roleLabel, items, current }: { nickname: string; roleLabel: string; items: readonly NavItem[]; current?: string }) {
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
        className="hd-link hd-link--strong"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nick">{nickname}님</span>
        <Caret />
      </button>
      {/* tabIndex -1: 패널 안을 눌러도 포커스가 패널에 머물러 onBlur 가 닫지 않게(포커스를 옮기지 않는 브라우저 대비) */}
      <div className="hd-menu" id={panelId} hidden={!open} tabIndex={-1}>
        <p className="hd-who">
          {nickname}님 · {roleLabel}
        </p>
        {items.map((it) => (
          <Link key={it.href} href={it.href} aria-current={current === it.href ? "page" : undefined}>
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
      if (window.innerWidth > 1100) setMenuOpen(false); // 메뉴가 접히는 폭(site-header.css)과 같은 값
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  const logoHref = props.role === "guest" ? "/" : props.role === "fan" ? FAN_HOME : CREATOR_HOME;
  const logoLabel = props.role === "guest" ? "팬꾹 처음 화면" : props.role === "fan" ? "팬꾹 메인" : "팬꾹 크리에이터 메인";
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
            {SITE_NAV.map((it) => (
              <li key={it.href}>{navLink(it)}</li>
            ))}
          </ul>
        </nav>
        <div className="header-actions">
          {props.role === "guest" ? (
            <>
              <Link className="hd-link hd-link--sub hide-sm" href="/login" aria-current={props.current === "/login" ? "page" : undefined}>
                로그인
              </Link>
              <span className="hd-sep hide-sm" aria-hidden="true" />
              <Link className="hd-link hd-link--strong hide-sm" href="/signup" aria-current={props.current === "/signup" ? "page" : undefined}>
                회원가입
              </Link>
            </>
          ) : null}
          {props.role === "fan" && props.gifts.length > 0 ? (
            <>
              <GiftStatus gifts={props.gifts} />
              <button
                className="hd-gift gift-badge"
                type="button"
                aria-haspopup="dialog"
                aria-label={`진행 중인 선물 ${props.gifts.length}개 보기`}
                onClick={() => setSheetOpen(true)}
              >
                <span className="hd-ico">
                  <BoxGlyph />
                </span>
                선물
                <span className="hd-count">{props.gifts.length}</span>
              </button>
            </>
          ) : null}
          {props.role === "creator" ? (
            <Link className="hd-gift" href="/creator/requests" aria-label={`승인 대기 ${props.pendingCount}건`}>
              <span className="hd-ico">
                <BoxGlyph />
              </span>
              <span className="hide-sm">승인 대기</span>
              <span className="hd-count">{props.pendingCount}</span>
            </Link>
          ) : null}
          {props.role !== "guest" ? <span className="hd-sep hide-sm" aria-hidden="true" /> : null}
          {props.role === "fan" ? <UserMenu nickname={props.nickname} roleLabel="팬" items={FAN_MY_MENU} current={props.current} /> : null}
          {props.role === "creator" ? <UserMenu nickname={props.nickname} roleLabel="크리에이터" items={CREATOR_MY_MENU} current={props.current} /> : null}
          <button
            ref={toggleRef}
            className="menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {/* 시안 v11 — 둥근 막대 셋 */}
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="3" rx="1.5" fill="currentColor" />
              <rect x="3" y="10.5" width="18" height="3" rx="1.5" fill="currentColor" />
              <rect x="3" y="16" width="18" height="3" rx="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mobile-menu" id={menuId} hidden={!menuOpen}>
        {SITE_NAV.map((it) => (
          <Link key={it.href} href={it.href} aria-current={props.current === it.href ? "page" : undefined}>
            {it.label}
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
        {props.role !== "guest" ? (
          <>
            <p className="group-label">
              {MY_PAGE_TITLE} · {props.nickname}님
            </p>
            {(props.role === "creator" ? CREATOR_MY_MENU : FAN_MY_MENU).map((it) => (
              <Link key={it.href} href={it.href} aria-current={props.current === it.href ? "page" : undefined}>
                {props.role === "creator" && it.href === "/creator/requests" ? `${it.label} (대기 ${props.pendingCount}건)` : it.label}
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
