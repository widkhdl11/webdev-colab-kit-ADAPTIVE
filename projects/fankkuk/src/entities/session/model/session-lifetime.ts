// 역할별 로그인 유지 기간 (docs/specs/session-login.md INV-L16·L19·L20, 카드 fankkuk-20261031-1-d2). 기간 값은 이 파일 한 곳에만 둔다.
// 판정은 서버가 요청마다 한다(proxy). 절대 기간의 시작은 Auth 가 기록한 그 세션의 로그인 시각, 미사용은 서버가 적는 마지막 사용 시각이다.
// 쿠키 안의 값으로 판정하지 않는다(INV-L2) — 이 모듈은 DB 가 돌려준 사실만 받는다.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** member = 팬·크리에이터 · staff = 대표가 아닌 운영자 · owner = 대표(admin-console 의 대표 설정 표 계정) */
export type LifetimeClass = "member" | "staff" | "owner";

export const SESSION_LIFETIMES: Readonly<Record<LifetimeClass, { idleMs: number; absoluteMs: number }>> = {
  member: { idleMs: 7 * DAY, absoluteMs: 30 * DAY },
  staff: { idleMs: 30 * MIN, absoluteMs: 12 * HOUR },
  owner: { idleMs: 15 * MIN, absoluteMs: 12 * HOUR },
};

/** INV-L19: 끝나기 이만큼 전부터 운영자 화면에 「곧 로그아웃됩니다」 */
export const SESSION_WARNING_MS = 5 * MIN;
/** INV-L16: 마지막 사용 시각은 이만큼 지났을 때만 고친다(그래서 미사용 판정은 최대 1분 늦다) */
export const LAST_SEEN_TOUCH_INTERVAL_MS = MIN;
/** INV-L20: 운영자 폼 임시 저장을 남겨 두는 시간 */
export const DRAFT_MAX_AGE_MS = 12 * HOUR;

/** INV-L16: 역할 → 갈래. 모르는 역할은 가장 짧은 갈래로(넓게 열지 않는다). */
export function lifetimeClassOf(input: { role: string | null; isOwner: boolean }): LifetimeClass {
  if (input.role === "fan" || input.role === "creator") return "member";
  if (input.role === "operator") return input.isOwner ? "owner" : "staff";
  return "owner";
}

/** INV-L15·L16: 「유지」 켬 쿠키 유효기간(초) — 그 갈래의 절대 기간 */
export function sessionCookieMaxAgeSeconds(cls: LifetimeClass): number {
  return SESSION_LIFETIMES[cls].absoluteMs / 1000;
}

/** DB(session_lifetime_facts)가 돌려준 그 세션의 사실 — 시각은 밀리초 */
export type SessionFacts = { role: string | null; isOwner: boolean; createdAt: number; lastSeenAt: number | null };

export type SessionJudgement =
  | { expired: true; reason: "idle" | "absolute"; cls: LifetimeClass }
  | { expired: false; cls: LifetimeClass; endsAt: number; absoluteEndsAt: number; extendable: boolean; touch: boolean };

/**
 * INV-L16: 두 기간 중 먼저 오는 쪽에서 끝난다. 마지막 사용 기록이 없는 세션(규칙을 내보내기 전부터 있던 세션)은 처음 본 지금부터 미사용을 센다 —
 * 고치라는 표시(touch)와 함께 통과한다. 절대 기간은 그대로 로그인 시각부터다.
 */
export function judgeSession(f: SessionFacts, now: number): SessionJudgement {
  const cls = lifetimeClassOf(f);
  const { idleMs, absoluteMs } = SESSION_LIFETIMES[cls];
  const lastSeen = f.lastSeenAt ?? now;
  const absoluteEndsAt = f.createdAt + absoluteMs;
  const idleEndsAt = lastSeen + idleMs;
  if (now >= absoluteEndsAt) return { expired: true, reason: "absolute", cls };
  if (now >= idleEndsAt) return { expired: true, reason: "idle", cls };
  return {
    expired: false,
    cls,
    endsAt: Math.min(idleEndsAt, absoluteEndsAt),
    absoluteEndsAt,
    // INV-L19: [연장] 은 미사용 끝이 먼저 올 때만 — 절대 기간은 늘지 않는다
    extendable: idleEndsAt < absoluteEndsAt,
    touch: f.lastSeenAt === null || now - f.lastSeenAt >= LAST_SEEN_TOUCH_INTERVAL_MS,
  };
}
