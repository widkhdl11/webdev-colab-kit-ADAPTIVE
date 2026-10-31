// @vitest-environment node
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePasswordAttempts } from "@/entities/session/api/password-attempts-fake";
import { sessionCookieMaxAgeSeconds } from "@/entities/session/model/session-lifetime";
import { SESSION_ONLY_COOKIE } from "@/shared/api/supabase/session-cookies";
import { fakeAuthFetch, UNIT_AUTH_COOKIE, UNIT_CONFIG, unitSessionCookieValue } from "@/shared/api/supabase/session-cookies-fake-auth";

// 로그인 라우트가 이 요청에서 쓰는 로그인 쿠키 자체(route.test.ts 는 겉만 본다).
// 세션 클라이언트·라이브러리(@supabase/ssr)는 진짜다. 바꾸는 것은 Next 의 쿠키 저장소(메모리)·Auth 네트워크·횟수 기록 DB 뿐이다.

const requestCookies = new Map<string, string>();
const sets: { name: string; value: string; options?: CookieOptions }[] = [];

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (requestCookies.has(name) ? { name, value: requestCookies.get(name) ?? "" } : undefined),
    getAll: () => [...requestCookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: CookieOptions) => {
      sets.push({ name, value, options });
    },
  }),
}));
// 판정 재료(session-login INV-L16)는 늘 「팬」 — 「유지」 켬 쿠키 유효기간이 팬의 절대 기간인지 본다
vi.mock("@/shared/api/supabase/admin", () => ({
  createAdminSupabase: () => ({
    rpc: async (fn: string) => {
      if (fn !== "session_lifetime_facts") throw new Error(`모르는 함수 ${fn}`);
      const now = new Date().toISOString();
      return { data: [{ role: "fan", is_owner: false, created_at: now, last_seen_at: now, db_now: now }], error: null };
    },
  }),
}));
vi.mock("@/entities/session/api/password-attempts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/session/api/password-attempts")>()),
  passwordAttemptsOf: () => fakePasswordAttempts().attempts,
}));

const { POST } = await import("./route");

const SITE = "http://127.0.0.1:3000";
function post(body: unknown): NextRequest {
  const cookie = [...requestCookies].map(([n, v]) => `${n}=${v}`).join("; ");
  const headers: Record<string, string> = { origin: SITE, host: "127.0.0.1:3000", "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`${SITE}/api/auth/login`, { method: "POST", headers, body: JSON.stringify(body) });
}
const creds = { loginId: "byeolbit_fan", password: "pw-1234" };
/**
 * 라우트가 응답을 돌려준 그 시점까지 쓰인 쿠키만 본다. 응답 뒤에 끝나는 쓰기(store.set)는 실제 Next 에서
 * 브라우저에 가지 않으므로(쓰기 오류를 server.ts 가 삼킨다) 기다려서 세지 않는다.
 */
async function postNow(body: unknown): Promise<{ res: Response; written: typeof sets }> {
  return POST(post(body)).then((res) => ({ res, written: sets.slice() }));
}
const authWrites = (written: typeof sets) => written.filter((s) => s.name.startsWith(UNIT_AUTH_COOKIE) && s.value !== "");
const markerLines = (res: Response) => res.headers.getSetCookie().filter((l) => l.startsWith(`${SESSION_ONLY_COOKIE}=`));

/**
 * 실패 쪽 시험은 비밀번호 확인 답을 늦게 준다. 그래야 시작 때 건 토큰 갱신의 쿠키 쓰기가 응답 전에 끝나
 * 실패 응답에 실린다(S13e 가 막으려는 자리). 늦추지 않으면 그 쓰기는 응답 뒤에 끝나 브라우저에 가지 않는다.
 */
const SLOW_PASSWORD_MS = 20;
function useAuth(passwordOk: boolean) {
  const auth = fakeAuthFetch({ passwordOk, passwordDelayMs: passwordOk ? 0 : SLOW_PASSWORD_MS });
  vi.stubGlobal("fetch", auth.fetch);
  return auth;
}

beforeEach(() => {
  requestCookies.clear();
  sets.length = 0;
  vi.stubEnv("SUPABASE_URL", UNIT_CONFIG.url);
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", UNIT_CONFIG.anonKey);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("INV-L15: 로그인 실패 응답의 로그인 쿠키는 원래 표시대로 쓴다", () => {
  it("INV-L15 (S13e, 실패경로): 끄고 로그인한 표시 + 만료 직전 토큰으로 켜고 틀리면, 갱신으로 쓴 로그인 쿠키에 만료 시각이 없고 표시는 그대로", async () => {
    requestCookies.set(SESSION_ONLY_COOKIE, "1");
    requestCookies.set(UNIT_AUTH_COOKIE, unitSessionCookieValue(5)); // 곧 만료 → 시작 때 갱신
    const auth = useAuth(false);
    const { res, written } = await postNow({ ...creds, keepSignedIn: true });
    expect(res.status).toBe(401);
    expect(auth.calls.some((u) => u.includes("grant_type=refresh_token"))).toBe(true);
    expect(authWrites(written).length).toBeGreaterThan(0);
    for (const c of authWrites(written)) {
      expect(c.options?.maxAge).toBeUndefined();
      expect(c.options?.expires).toBeUndefined();
    }
    expect(markerLines(res)).toEqual([]);
    expect(written.filter((s) => s.name === SESSION_ONLY_COOKIE)).toEqual([]);
  });

  it("INV-L15 (S13e, 실패경로): 표시가 없는(켜고 로그인한) 사람이 끄고 틀리면 갱신 쿠키는 원래대로 만료 시각(그 역할의 절대 기간, INV-L16)이 붙는다", async () => {
    requestCookies.set(UNIT_AUTH_COOKIE, unitSessionCookieValue(5));
    useAuth(false);
    const { res, written } = await postNow({ ...creds, keepSignedIn: false });
    expect(res.status).toBe(401);
    expect(authWrites(written).length).toBeGreaterThan(0);
    for (const c of authWrites(written)) expect(c.options?.maxAge).toBe(sessionCookieMaxAgeSeconds("member"));
    expect(markerLines(res)).toEqual([]);
  });

  it("INV-L15·INV-L5 (S13e): 실패 응답의 상태·본문은 고른 값과 상관없이 같다", async () => {
    requestCookies.set(SESSION_ONLY_COOKIE, "1");
    requestCookies.set(UNIT_AUTH_COOKIE, unitSessionCookieValue(5));
    useAuth(false);
    const on = await POST(post({ ...creds, keepSignedIn: true }));
    const off = await POST(post({ ...creds, keepSignedIn: false }));
    expect(on.status).toBe(off.status);
    expect(await on.json()).toEqual(await off.json());
  });
});

describe("INV-L15: 로그인 성공 응답의 로그인 쿠키는 고른 값대로 쓴다", () => {
  it("INV-L15 (S13): 끄고 성공하면 표시가 없어도 로그인 쿠키에 만료 시각이 없다", async () => {
    useAuth(true);
    const { res, written } = await postNow({ ...creds, keepSignedIn: false });
    expect(res.status).toBe(200);
    expect(authWrites(written).length).toBeGreaterThan(0);
    for (const c of authWrites(written)) {
      expect(c.options?.maxAge).toBeUndefined();
      expect(c.options?.expires).toBeUndefined();
    }
  });

  it("INV-L15 (S13c): 켜고 성공하면 남은 표시가 있어도 로그인 쿠키에 만료 시각(그 역할의 절대 기간, INV-L16)이 붙는다", async () => {
    requestCookies.set(SESSION_ONLY_COOKIE, "1");
    requestCookies.set(UNIT_AUTH_COOKIE, unitSessionCookieValue(5));
    useAuth(true);
    const { res, written } = await postNow({ ...creds, keepSignedIn: true });
    expect(res.status).toBe(200);
    expect(authWrites(written).length).toBeGreaterThan(0);
    for (const c of authWrites(written)) expect(c.options?.maxAge).toBe(sessionCookieMaxAgeSeconds("member"));
  });
});
