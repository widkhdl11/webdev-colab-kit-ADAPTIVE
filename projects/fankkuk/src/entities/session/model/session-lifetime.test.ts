import { describe, expect, it } from "vitest";
import {
  DRAFT_MAX_AGE_MS,
  judgeSession,
  LAST_SEEN_TOUCH_INTERVAL_MS,
  lifetimeClassOf,
  SESSION_LIFETIMES,
  SESSION_WARNING_MS,
  sessionCookieMaxAgeSeconds,
  type SessionFacts,
} from "./session-lifetime";

// 역할별 로그인 유지 기간 (docs/specs/session-login.md INV-L16·L19·L20). 값마다 고정 시험이 하나씩 있다.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("INV-L16: 기간 값 — 값마다 고정", () => {
  it("INV-L16: 팬·크리에이터 미사용 7일", () => expect(SESSION_LIFETIMES.member.idleMs).toBe(7 * DAY));
  it("INV-L16: 팬·크리에이터 절대 30일", () => expect(SESSION_LIFETIMES.member.absoluteMs).toBe(30 * DAY));
  it("INV-L16: 직원 미사용 30분", () => expect(SESSION_LIFETIMES.staff.idleMs).toBe(30 * MIN));
  it("INV-L16: 직원 절대 12시간", () => expect(SESSION_LIFETIMES.staff.absoluteMs).toBe(12 * HOUR));
  it("INV-L16: 대표 미사용 15분", () => expect(SESSION_LIFETIMES.owner.idleMs).toBe(15 * MIN));
  it("INV-L16: 대표 절대 12시간", () => expect(SESSION_LIFETIMES.owner.absoluteMs).toBe(12 * HOUR));
  it("INV-L19: 경고는 끝나기 5분 전", () => expect(SESSION_WARNING_MS).toBe(5 * MIN));
  it("INV-L16: 마지막 사용 시각은 1분이 지났을 때만 고친다", () => expect(LAST_SEEN_TOUCH_INTERVAL_MS).toBe(MIN));
  it("INV-L20: 임시 저장은 12시간", () => expect(DRAFT_MAX_AGE_MS).toBe(12 * HOUR));
});

describe("INV-L16: 역할 → 기간 갈래", () => {
  it("INV-L16: 팬·크리에이터는 member, 대표가 아닌 운영자는 staff, 대표는 owner", () => {
    expect(lifetimeClassOf({ role: "fan", isOwner: false })).toBe("member");
    expect(lifetimeClassOf({ role: "creator", isOwner: false })).toBe("member");
    expect(lifetimeClassOf({ role: "operator", isOwner: false })).toBe("staff");
    expect(lifetimeClassOf({ role: "operator", isOwner: true })).toBe("owner");
  });

  it("INV-L16 (실패경로): 모르는 역할은 가장 짧은 갈래(대표)로", () => {
    expect(lifetimeClassOf({ role: "unknown", isOwner: false })).toBe("owner");
    expect(lifetimeClassOf({ role: null, isOwner: false })).toBe("owner");
  });

  it("INV-L16 · INV-L15 (S14e): 「유지」 켬 쿠키 유효기간은 그 갈래의 절대 기간(초)", () => {
    expect(sessionCookieMaxAgeSeconds("member")).toBe(SESSION_LIFETIMES.member.absoluteMs / 1000);
    expect(sessionCookieMaxAgeSeconds("staff")).toBe(SESSION_LIFETIMES.staff.absoluteMs / 1000);
    expect(sessionCookieMaxAgeSeconds("owner")).toBe(SESSION_LIFETIMES.owner.absoluteMs / 1000);
  });
});

const NOW = Date.parse("2026-10-31T12:00:00Z");
function facts(cls: "member" | "staff" | "owner", loginAgoMs: number, lastSeenAgoMs: number | null): SessionFacts {
  const role = cls === "member" ? "fan" : "operator";
  return { role, isOwner: cls === "owner", createdAt: NOW - loginAgoMs, lastSeenAt: lastSeenAgoMs === null ? null : NOW - lastSeenAgoMs };
}

describe("INV-L16: 두 기간 중 먼저 오는 쪽에서 끝난다", () => {
  it("INV-L16 (S14): 팬이 마지막 사용 뒤 7일 − 1분이면 그대로, 7일이면 끝", () => {
    const { idleMs } = SESSION_LIFETIMES.member;
    expect(judgeSession(facts("member", DAY * 10, idleMs - MIN), NOW).expired).toBe(false);
    expect(judgeSession(facts("member", DAY * 10, idleMs), NOW)).toMatchObject({ expired: true, reason: "idle" });
  });

  it("INV-L16 (S14b, 실패경로): 매일 써도 로그인한 지 30일이면 끝", () => {
    const { absoluteMs } = SESSION_LIFETIMES.member;
    expect(judgeSession(facts("member", absoluteMs - MIN, MIN), NOW).expired).toBe(false);
    expect(judgeSession(facts("member", absoluteMs, MIN), NOW)).toMatchObject({ expired: true, reason: "absolute" });
  });

  it("INV-L16 (S14c): 직원은 미사용 30분·절대 12시간, 대표는 미사용 15분", () => {
    expect(judgeSession(facts("staff", HOUR, SESSION_LIFETIMES.staff.idleMs), NOW).expired).toBe(true);
    expect(judgeSession(facts("staff", SESSION_LIFETIMES.staff.absoluteMs, MIN), NOW).expired).toBe(true);
    expect(judgeSession(facts("staff", HOUR, SESSION_LIFETIMES.owner.idleMs), NOW).expired).toBe(false);
    expect(judgeSession(facts("owner", HOUR, SESSION_LIFETIMES.owner.idleMs), NOW).expired).toBe(true);
  });

  it("INV-L16 (S14d, 실패경로): 크리에이터였다가 운영자가 된 계정은 운영자 기간 — 31분 미사용이면 끝", () => {
    expect(judgeSession({ role: "operator", isOwner: false, createdAt: NOW - HOUR, lastSeenAt: NOW - 31 * MIN }, NOW).expired).toBe(true);
  });

  it("INV-L16: 마지막 사용 기록이 없는 세션(규칙을 내보내기 전부터 있던 세션)은 처음 본 때부터 미사용을 센다 — 고치고 통과", () => {
    const v = judgeSession(facts("staff", SESSION_LIFETIMES.staff.idleMs * 3, null), NOW);
    expect(v).toMatchObject({ expired: false, touch: true, endsAt: NOW + SESSION_LIFETIMES.staff.idleMs });
  });

  it("INV-L16 (실패경로): 마지막 사용 기록이 없어도 절대 기간은 로그인 시각부터 — 넘었으면 끝", () => {
    expect(judgeSession(facts("staff", SESSION_LIFETIMES.staff.absoluteMs, null), NOW)).toMatchObject({ expired: true, reason: "absolute" });
  });

  it("INV-L16: 끝나는 시각은 두 끝 중 이른 쪽, [연장] 은 미사용 끝이 먼저일 때만", () => {
    const idleFirst = judgeSession(facts("staff", HOUR, 10 * MIN), NOW);
    expect(idleFirst).toMatchObject({ expired: false, endsAt: NOW - 10 * MIN + SESSION_LIFETIMES.staff.idleMs, extendable: true });
    const absFirst = judgeSession(facts("staff", SESSION_LIFETIMES.staff.absoluteMs - 2 * MIN, 0), NOW);
    expect(absFirst).toMatchObject({ expired: false, endsAt: NOW + 2 * MIN, extendable: false });
  });

  it("INV-L16: 1분이 지났을 때만 마지막 사용 시각을 고친다", () => {
    expect(judgeSession(facts("member", HOUR, LAST_SEEN_TOUCH_INTERVAL_MS - 1), NOW)).toMatchObject({ expired: false, touch: false });
    expect(judgeSession(facts("member", HOUR, LAST_SEEN_TOUCH_INTERVAL_MS), NOW)).toMatchObject({ expired: false, touch: true });
    expect(judgeSession(facts("member", HOUR, null), NOW)).toMatchObject({ expired: false, touch: true });
  });
});
