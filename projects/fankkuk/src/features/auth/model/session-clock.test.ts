import { describe, expect, it } from "vitest";
import type { SessionActivity } from "@/entities/session/api/session-activity";
import { SESSION_LIFETIMES } from "@/entities/session/model/session-lifetime";
import { extendSession, readSessionClock } from "./session-clock";

// 운영자 화면의 끝나는 시각과 [연장] (docs/specs/session-login.md INV-L19).

const MIN = 60_000;
const NOW = Date.parse("2026-10-31T12:00:00Z");
const USER = "00000000-0000-4000-a000-000000000021";
const SESSION = "11111111-2222-4333-8444-555555555555";

function token(): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "HS256" })}.${b({ sub: USER, session_id: SESSION })}.sig`;
}
const auth = { getSession: async () => ({ data: { session: { access_token: token() } }, error: null }) } as never;

function fakeActivity(loginAgo: number, lastSeenAgo: number) {
  let lastSeen = NOW - lastSeenAgo;
  const touched: string[] = [];
  const activity: SessionActivity = {
    facts: async () => ({ facts: { role: "operator", isOwner: false, createdAt: NOW - loginAgo, lastSeenAt: lastSeen }, now: NOW }),
    touch: async (u, s) => {
      touched.push(`${u}:${s}`);
      lastSeen = NOW;
      return true;
    },
    end: async () => {},
    loginLinkReady: async () => false,
  };
  return { activity, touched };
}

describe("INV-L19: 끝나는 시각은 서버가 정한다", () => {
  it("INV-L19 (S17): 직원이 미사용 25분이면 끝은 5분 뒤, [연장] 가능", async () => {
    const { activity } = fakeActivity(60 * MIN, SESSION_LIFETIMES.staff.idleMs - 5 * MIN);
    expect(await readSessionClock(auth, activity)).toEqual({ endsAt: NOW + 5 * MIN, extendable: true, now: NOW });
  });

  it("INV-L19 (S17): [연장] 은 그 세션의 마지막 사용 시각을 고치고 끝을 미사용 기간만큼 뒤로", async () => {
    const { activity, touched } = fakeActivity(60 * MIN, SESSION_LIFETIMES.staff.idleMs - 5 * MIN);
    expect(await extendSession(auth, activity)).toEqual({ endsAt: NOW + SESSION_LIFETIMES.staff.idleMs, extendable: true, now: NOW });
    expect(touched).toEqual([`${USER}:${SESSION}`]);
  });

  it("INV-L19 (S17b, 실패경로): 절대 끝까지 5분이면 [연장] 없음 — 연장해도 끝나는 시각은 그대로", async () => {
    const { activity } = fakeActivity(SESSION_LIFETIMES.staff.absoluteMs - 5 * MIN, 0);
    expect(await readSessionClock(auth, activity)).toEqual({ endsAt: NOW + 5 * MIN, extendable: false, now: NOW });
    expect(await extendSession(auth, activity)).toEqual({ endsAt: NOW + 5 * MIN, extendable: false, now: NOW });
  });

  it("INV-L19 (실패경로): 이미 끝났거나 세션이 없으면 null", async () => {
    const { activity } = fakeActivity(60 * MIN, SESSION_LIFETIMES.staff.idleMs);
    expect(await readSessionClock(auth, activity)).toBeNull();
    const none = { getSession: async () => ({ data: { session: null }, error: null }) } as never;
    expect(await readSessionClock(none, activity)).toBeNull();
  });
});
