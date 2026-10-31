import type { CookieMethodsServer } from "@supabase/ssr";
import { afterEach, describe, expect, it } from "vitest";
import { currentSessionIds, sessionActivityOf } from "@/entities/session/api/session-activity";
import { SESSION_LIFETIMES } from "@/entities/session/model/session-lifetime";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { guardSession } from "@/features/auth/model/session-guard";
import { createSessionClient } from "@/shared/api/supabase/session-cookies";
import { adminClient, anonClient, psql, SEED, signedInClient } from "./helpers";

// 역할별 로그인 유지 기간 — 실제 로컬 Supabase(Auth 세션 + DB 함수)와 맞물려 (docs/specs/session-login.md INV-L16·L17·L18).
// 시각이 걸린 시험은 기다리지 않고 DB 의 시각 칸(마지막 사용 시각·Auth 세션의 로그인 시각)을 당겨 「그만큼 시간이 흐른 상태」를 만든다.
// 기간 값은 숫자로 쓰지 않고 상수(session-lifetime)에서 읽는다.

type Jar = Map<string, { value: string; options: Record<string, unknown> }>;

function memoryCookies(jar: Jar): CookieMethodsServer {
  return {
    getAll: () => [...jar].map(([name, c]) => ({ name, value: c.value })),
    setAll: (list) => {
      for (const { name, value, options } of list) {
        if (value === "" || options?.maxAge === 0) jar.delete(name);
        else jar.set(name, { value, options: { ...options } });
      }
    },
  };
}

const config = () => ({ url: process.env.FK_TEST_API_URL ?? "", anonKey: process.env.FK_TEST_ANON_KEY ?? "" });
const dev = { NODE_ENV: "development" };
const session = (jar: Jar) => createSessionClient(config(), memoryCookies(jar), dev);
const activity = () => sessionActivityOf(adminClient());
const ACTIVITY = "public.session_activity";

const createdSessions: string[] = [];
afterEach(() => {
  if (createdSessions.length) psql(`delete from ${ACTIVITY} where session_id in (${createdSessions.map((s) => `'${s}'`).join(",")})`);
  createdSessions.length = 0;
});

async function loggedIn(loginId: string): Promise<{ jar: Jar; userId: string; sessionId: string }> {
  const jar: Jar = new Map();
  const { error } = await session(jar).auth.signInWithPassword({ email: `${loginId}@fankkuk.test`, password: "fankkuk-local-1234" });
  expect(error).toBeNull();
  const ids = await currentSessionIds(session(jar).auth);
  expect(ids).not.toBeNull();
  createdSessions.push(ids!.sessionId);
  return { jar, ...ids! };
}

/** 마지막 사용 시각을 ms 만큼 과거로(줄이 없으면 만든다) */
function lastSeenAgo(userId: string, sessionId: string, ms: number): void {
  psql(
    `insert into ${ACTIVITY} (session_id, user_id, last_seen_at) values ('${sessionId}', '${userId}', now() - make_interval(secs => ${ms / 1000})) on conflict (session_id) do update set last_seen_at = excluded.last_seen_at`,
  );
}
/** Auth 세션의 로그인 시각을 ms 만큼 과거로 */
function loginAgo(sessionId: string, ms: number): void {
  psql(`update auth.sessions set created_at = now() - make_interval(secs => ${ms / 1000}) where id = '${sessionId}'`);
}

const guard = (jar: Jar, userId: string, countsAsUse = true) => guardSession({ auth: session(jar).auth, activity: activity() }, userId, { countsAsUse });

describe("INV-L16: 판정 재료 — 그 사람의 그 세션만", () => {
  it("INV-L16: 로그인하면 판정 재료가 역할·대표 여부·Auth 의 로그인 시각으로 온다", async () => {
    const fan = await loggedIn("byeolbit_fan");
    const got = await activity().facts(fan.userId, fan.sessionId);
    expect(got?.facts.role).toBe("fan");
    expect(got?.facts.isOwner).toBe(false);
    expect(Math.abs(got!.facts.createdAt - got!.now)).toBeLessThan(60_000);
    const owner = await loggedIn("fankkuk_admin");
    expect((await activity().facts(owner.userId, owner.sessionId))?.facts).toMatchObject({ role: "operator", isOwner: true });
  });

  it("INV-L16 (실패경로): 남의 세션 id 로 묻거나 고치면 아무것도 없다", async () => {
    const fan = await loggedIn("byeolbit_fan");
    const other = await loggedIn("daltokki_fan");
    expect(await activity().facts(fan.userId, other.sessionId)).toBeNull();
    expect(await activity().touch(fan.userId, other.sessionId)).toBe(false);
    expect(psql(`select count(*) from ${ACTIVITY} where session_id = '${other.sessionId}' and user_id = '${fan.userId}'`)).toBe("0");
  });

  it("INV-L16 (실패경로): 화면 쪽 키는 표에도 함수에도 닿지 않는다", async () => {
    const fan = await loggedIn("byeolbit_fan");
    const signed = await signedInClient("byeolbit_fan");
    for (const c of [anonClient(), signed]) {
      expect((await c.rpc("session_lifetime_facts", { p_user_id: fan.userId, p_session_id: fan.sessionId })).error).not.toBeNull();
      expect((await c.rpc("session_touch", { p_user_id: fan.userId, p_session_id: fan.sessionId })).error).not.toBeNull();
      expect((await c.rpc("session_end", { p_user_id: fan.userId, p_session_id: fan.sessionId })).error).not.toBeNull();
      expect((await c.from("session_activity").select("*")).error).not.toBeNull();
    }
    expect((await adminClient().from("session_activity").select("*")).error).not.toBeNull();
  });
});

describe("INV-L16: 기간 안이면 그대로, 넘으면 서버에서 끝낸다(실제 Auth)", () => {
  it("INV-L16 (S14): 팬이 미사용 7일 − 1시간이면 그대로이고 마지막 사용 시각이 지금으로 고쳐진다", async () => {
    const fan = await loggedIn("byeolbit_fan");
    lastSeenAgo(fan.userId, fan.sessionId, SESSION_LIFETIMES.member.idleMs - 3_600_000);
    expect((await guard(fan.jar, fan.userId)).kind).toBe("ok");
    expect(Number(psql(`select extract(epoch from now() - last_seen_at)::int from ${ACTIVITY} where session_id = '${fan.sessionId}'`))).toBeLessThan(60);
  });

  it("INV-L16 (S14, 실패경로): 팬이 미사용 7일이면 끝 — 서버 세션이 사라져 같은 쿠키로 다시 와도 로그인 안 함", async () => {
    const fan = await loggedIn("byeolbit_fan");
    const copied: Jar = new Map(fan.jar);
    lastSeenAgo(fan.userId, fan.sessionId, SESSION_LIFETIMES.member.idleMs);
    expect(await guard(fan.jar, fan.userId)).toEqual({ kind: "ended", byLifetime: true, linkHint: false });
    expect(psql(`select count(*) from auth.sessions where id = '${fan.sessionId}'`)).toBe("0");
    expect([...fan.jar.keys()].filter((n) => n.includes("auth-token"))).toEqual([]);
    expect(await readVerifiedUserId(session(copied).auth)).toBeNull();
  });

  it("INV-L17 (S15b, 실패경로): 다른 이유로 이미 끝난 세션(Auth 세션 줄이 없음 — 비밀번호 바꾸기 등)은 끝내되 기간 안내 표시는 없다", async () => {
    const fan = await loggedIn("byeolbit_fan");
    psql(`delete from auth.sessions where id = '${fan.sessionId}'`);
    expect(await guard(fan.jar, fan.userId)).toEqual({ kind: "ended", byLifetime: false, linkHint: false });
  });

  it("INV-L16: 마지막 사용 기록이 없는 세션은 로그인한 지 오래돼도(절대 기간 안) 통과하고 지금부터 센다", async () => {
    const staff = await loggedIn("fankkuk_staff");
    psql(`delete from ${ACTIVITY} where session_id = '${staff.sessionId}'`);
    loginAgo(staff.sessionId, SESSION_LIFETIMES.staff.idleMs * 2);
    expect((await guard(staff.jar, staff.userId)).kind).toBe("ok");
    expect(Number(psql(`select extract(epoch from now() - last_seen_at)::int from ${ACTIVITY} where session_id = '${staff.sessionId}'`))).toBeLessThan(60);
  });

  it("INV-L16 (S14b, 실패경로): 매일 써도 로그인한 지 30일이면 끝", async () => {
    const fan = await loggedIn("byeolbit_fan");
    loginAgo(fan.sessionId, SESSION_LIFETIMES.member.absoluteMs);
    lastSeenAgo(fan.userId, fan.sessionId, 60_000);
    expect((await guard(fan.jar, fan.userId)).kind).toBe("ended");
  });

  it("INV-L16 (S14c): 직원은 미사용 30분이면 끝, 대표는 15분이면 끝(그 시간에 직원은 그대로)", async () => {
    const staff = await loggedIn("fankkuk_staff");
    lastSeenAgo(staff.userId, staff.sessionId, SESSION_LIFETIMES.owner.idleMs);
    expect((await guard(staff.jar, staff.userId)).kind).toBe("ok");
    lastSeenAgo(staff.userId, staff.sessionId, SESSION_LIFETIMES.staff.idleMs);
    expect((await guard(staff.jar, staff.userId)).kind).toBe("ended");
    const owner = await loggedIn("fankkuk_admin");
    lastSeenAgo(owner.userId, owner.sessionId, SESSION_LIFETIMES.owner.idleMs);
    expect((await guard(owner.jar, owner.userId)).kind).toBe("ended");
  });

  it("INV-L16 (S14c): 직원은 로그인한 지 12시간이면 끝", async () => {
    const staff = await loggedIn("fankkuk_staff");
    loginAgo(staff.sessionId, SESSION_LIFETIMES.staff.absoluteMs);
    lastSeenAgo(staff.userId, staff.sessionId, 60_000);
    expect((await guard(staff.jar, staff.userId)).kind).toBe("ended");
  });

  it("INV-L17 (S15): 크리에이터가 끝났을 때 링크 템플릿이 등록돼 있으면 링크 안내 표시, 등록 전이면 없음", async () => {
    const before = psql(`select count(*) from public.notification_kakao_templates`);
    try {
      const a = await loggedIn("haru_creator");
      lastSeenAgo(a.userId, a.sessionId, SESSION_LIFETIMES.member.idleMs);
      expect(await guard(a.jar, a.userId)).toEqual({ kind: "ended", byLifetime: true, linkHint: false });
      psql(`insert into public.notification_kakao_templates (kind, template_code, login_link_template_code) values ('approval_request', 'TPL_A', 'TPL_A_LINK') on conflict (kind) do update set login_link_template_code = 'TPL_A_LINK'`);
      const b = await loggedIn("haru_creator");
      lastSeenAgo(b.userId, b.sessionId, SESSION_LIFETIMES.member.idleMs);
      expect(await guard(b.jar, b.userId)).toEqual({ kind: "ended", byLifetime: true, linkHint: true });
    } finally {
      if (before === "0") psql(`delete from public.notification_kakao_templates`);
    }
  });
});
