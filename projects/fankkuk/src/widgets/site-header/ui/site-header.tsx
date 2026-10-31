"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CREATOR_HOME, FAN_HOME } from "@/entities/session/model/home-path";
import { DRAFT_MAX_AGE_MS } from "@/entities/session/model/session-lifetime";
import { DraftPurge } from "@/shared/lib/form-draft/use-form-draft";
import { LogoMark } from "@/shared/ui/logo";
import { CREATOR_APP_MENU, FAN_APP_MENU } from "../model/app-menu";
import { useLastHeader, useRememberHeader } from "../model/header-memory";
import { Icon } from "./app-icons";
import { AppSidebar } from "./app-sidebar";

// 사이트 머리(design-rules 00절, 시안 v18). 로그인 전 = 위쪽 상단 바(높이 64, 767 이하 햄버거) ·
// 로그인 후 = 왼쪽 앱 사이드바(app-sidebar.tsx). 시안: v18/landing.html(상단 바) · home-fan.html·home-creator.html(사이드바)

type NavItem = { href: string; label: string };

const SITE_NAV: NavItem[] = [
  { href: "/creators", label: "크리에이터 찾기" },
  { href: "/gifts/new", label: "선물 보내기" },
  { href: "/notices", label: "공지사항" },
  { href: "/about", label: "팬꾹 소개" },
  { href: "/support", label: "고객센터" },
];

export type SiteHeaderProps =
  | { role: "guest"; current?: string }
  | { role: "fan"; current?: string; nickname: string; actionCount: number; viewerId?: string }
  | { role: "creator"; current?: string; nickname: string; actionCount: number; viewerId?: string };

function GuestTopBar({ current }: { current?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    document.body.classList.add("no-scroll");
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth > 767) setMenuOpen(false); // 메뉴가 접히는 폭(site-header.css)과 같은 값
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.classList.remove("no-scroll");
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  const cur = (href: string) => (current === href ? "page" : undefined);

  return (
    <header className="site-header">
      <div className="pub-inner header-inner">
        <Link className="logo" href="/" aria-label="팬꾹 처음 화면">
          <LogoMark size={32} />
          팬꾹
        </Link>
        <nav className="nav" aria-label="주요 메뉴">
          <ul>
            {SITE_NAV.map((it) => (
              <li key={it.href}>
                <Link href={it.href} aria-current={cur(it.href)}>
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="header-actions">
          <div className="auth">
            <Link href="/login" aria-current={cur("/login")}>
              로그인
            </Link>
            <span className="sep" aria-hidden="true" />
            <Link className="strong" href="/signup" aria-current={cur("/signup")}>
              회원가입
            </Link>
          </div>
          <button
            ref={toggleRef}
            className="menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon name={menuOpen ? "x" : "menu"} />
          </button>
        </div>
      </div>
      <div className="mobile-menu" id={menuId} hidden={!menuOpen}>
        {SITE_NAV.map((it) => (
          <Link key={it.href} href={it.href} aria-current={cur(it.href)} onClick={() => setMenuOpen(false)}>
            {it.label}
          </Link>
        ))}
        <div className="btn-row">
          <Link className="btn btn--line" href="/login">
            로그인
          </Link>
          <Link className="btn" href="/signup">
            회원가입
          </Link>
        </div>
      </div>
    </header>
  );
}

/** 각 페이지가 그리는 상단 바. 그린 값을 기억해 두어 페이지를 옮기는 동안 로딩 화면(RememberedSiteHeader)이 같은 바를 보여 준다. */
export function SiteHeader(props: SiteHeaderProps) {
  useRememberHeader(props);
  return (
    <>
      {/* session-login INV-L20: 로그인한 사람이 있으면 다른 계정의 폼 임시 저장도 지운다(만료된 것은 사이트 공통 틀이 늘 지운다) */}
      {props.role !== "guest" && props.viewerId ? <DraftPurge userId={props.viewerId} maxAgeMs={DRAFT_MAX_AGE_MS} /> : null}
      <SiteHeaderView {...props} />
    </>
  );
}

/** 로딩 화면용 — 마지막으로 그린 상단 바를 그대로, 메뉴 표시만 지금 가는 주소로. 기억이 없으면(처음 들어온 직후) 그리지 않는다. */
export function RememberedSiteHeader() {
  const last = useLastHeader();
  const pathname = usePathname();
  return last ? <SiteHeaderView {...last} current={pathname} /> : null;
}

function SiteHeaderView(props: SiteHeaderProps) {
  if (props.role === "guest") return <GuestTopBar current={props.current} />;
  if (props.role === "fan") {
    return (
      <AppSidebar
        role="fan"
        groups={FAN_APP_MENU}
        current={props.current}
        homeHref={FAN_HOME}
        nickname={props.nickname}
        counts={{ actions: props.actionCount }}
      />
    );
  }
  return (
    <AppSidebar
      role="creator"
      groups={CREATOR_APP_MENU}
      current={props.current}
      homeHref={CREATOR_HOME}
      nickname={props.nickname}
      counts={{ actions: props.actionCount }}
    />
  );
}
