// @vitest-environment node
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePasswordAttempts } from "@/entities/session/api/password-attempts-fake";
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
vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => ({}) }));
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
/** 라이브러리가 시작 때 건 토큰 갱신은 응답과 따로 끝날 수 있다 — 그 쓰기까지 기다린다. */
const settle = () => new Promise((r) => setTimeout(r, 30));
const authWrites = () => sets.filter((s) => s.name.startsWith(UNIT_AUTH_COOKIE) && s.value !== "");
const markerLines = (res: Response) => res.headers.getSetCookie().filter((l) => l.startsWith(`${SESSION_ONLY_COOKIE}=`));
const FOUR_HUNDRED_DAYS = 400 * 24 * 60 * 60;

function useAuth(passwordOk: boolean) {
  const auth = fakeAuthFetch({ passwordOk });
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
    const res = await POST(post({ ...creds, keepSignedIn: true }));
    await settle();
    expect(res.status).toBe(401);
    expect(auth.calls.some((u) => u.includes("grant_type=refresh_token"))).toBe(true);
    expect(authWrites().length).toBeGreaterThan(0);
    for (const c of authWrites()) {
      expect(c.options?.maxAge).toBeUndefined();
      expect(c.options?.expires).toBeUndefined();
    }
    expect(markerLines(res)).toEqual([]);
    expect(sets.filter((s) => s.name === SESSION_ONLY_COOKIE)).toEqual([]);
  });

  it("INV-L15 (S13e, 실패경로): 표시가 없는(켜고 로그인한) 사람이 끄고 틀리면 갱신 쿠키는 원래대로 만료 시각이 붙는다", async () => {
    requestCookies.set(UNIT_AUTH_COOKIE, unitSessionCookieValue(5));
    useAuth(false);
    const res = await POST(post({ ...creds, keepSignedIn: false }));
    await settle();
    expect(res.status).toBe(401);
    expect(authWrites().length).toBeGreaterThan(0);
    for (const c of authWrites()) expect(c.options?.maxAge).toBe(FOUR_HUNDRED_DAYS);
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
    const res = await POST(post({ ...creds, keepSignedIn: false }));
    expect(res.status).toBe(200);
    expect(authWrites().length).toBeGreaterThan(0);
    for (const c of authWrites()) {
      expect(c.options?.maxAge).toBeUndefined();
      expect(c.options?.expires).toBeUndefined();
    }
  });

  it("INV-L15 (S13c): 켜고 성공하면 남은 표시가 있어도 로그인 쿠키에 만료 시각이 붙는다", async () => {
    requestCookies.set(SESSION_ONLY_COOKIE, "1");
    requestCookies.set(UNIT_AUTH_COOKIE, unitSessionCookieValue(5));
    useAuth(true);
    const res = await POST(post({ ...creds, keepSignedIn: true }));
    await settle();
    expect(res.status).toBe(200);
    expect(authWrites().length).toBeGreaterThan(0);
    for (const c of authWrites()) expect(c.options?.maxAge).toBe(FOUR_HUNDRED_DAYS);
  });
});
