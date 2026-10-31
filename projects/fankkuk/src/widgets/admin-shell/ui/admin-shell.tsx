import Link from "next/link";
import type { ReactNode } from "react";
import { DRAFT_MAX_AGE_MS } from "@/entities/session/model/session-lifetime";
import type { SessionClock } from "@/features/auth/model/session-clock";
import { SessionExpiryNotice } from "@/features/auth/ui/session-expiry-notice";
import { DraftScope } from "@/shared/lib/form-draft/use-form-draft";
import { LogoMark } from "@/shared/ui/logo";
import { AdminCrumb, AdminNav } from "./admin-nav";
import s from "./admin-shell.module.css";

// 관리자 틀 (design-rules 8절, 시안 admin/*.html). 왼쪽 세로 메뉴 + 위 줄(현재 위치 · 운영자 닉네임 · 대표/직원 배지) + 본문.
// 사이트 헤더·푸터는 없다. 1024px 미만에서는 틀 대신 「PC에서 써 주세요」 안내만 보인다.
// 사람은 닉네임으로만 보인다(INV-K8). 역할 배지는 DB 판정(is_owner) 결과다 — 시안의 보기 전환은 없다.
// session-login INV-L19: 위 줄에 끝나기 5분 전 「곧 로그아웃됩니다」(끝나는 시각은 서버가 준 clock). INV-L20: 본문의 폼은 이 계정으로 임시 저장한다.

type Props = { userId: string; nickname: string; access: "staff" | "owner"; clock: SessionClock | null; children: ReactNode };

export function AdminShell({ userId, nickname, access, clock, children }: Props) {
  const initial = Array.from(nickname)[0] ?? "?";
  return (
    // admin-area: 공통 스타일(base.css)이 사용자 화면용 자동 간격(v11 14·15절)을 운영자 화면에서 빼는 표지
    <div className={`${s.root} admin-area`}>
      <div className={s.pcOnly}>
        <h1>PC에서 써 주세요</h1>
        <p className={s.sub}>운영자 화면은 넓은 화면에서 쓰도록 만들었어요. 1024px 이상 화면에서 열어 주세요.</p>
      </div>
      <aside className={s.side} aria-label="운영자 메뉴">
        <Link className={s.sideLogo} href="/admin">
          <LogoMark size={28} />
          팬꾹<small>운영자</small>
        </Link>
        <AdminNav />
      </aside>
      <div className={s.main}>
        <header className={s.topbar}>
          <AdminCrumb />
          <div className={s.topbarRight}>
            <SessionExpiryNotice initial={clock} />
            <span className={s.who}>
              <span className={s.face} aria-hidden="true">
                {initial}
              </span>
              <span className={s.nm}>{nickname} 님</span>
              <span className={access === "owner" ? s.badge : `${s.badge} ${s.badgeStaff}`}>{access === "owner" ? "대표" : "직원"}</span>
            </span>
          </div>
        </header>
        <main id="main" className={s.content}>
          <DraftScope userId={userId} maxAgeMs={DRAFT_MAX_AGE_MS}>
            {children}
          </DraftScope>
        </main>
      </div>
    </div>
  );
}
