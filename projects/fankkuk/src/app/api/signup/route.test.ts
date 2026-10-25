// @vitest-environment node
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_ONLY_COOKIE } from "@/shared/api/supabase/session-cookies";
import { fakeAuthFetch, UNIT_AUTH_COOKIE, UNIT_CONFIG } from "@/shared/api/supabase/session-cookies-fake-auth";

// 가입 직후 자동 로그인이 쓰는 로그인 쿠키(session-login INV-L15 · S13f).
// 세션 클라이언트·라이브러리는 진짜다. 계정 만들기(signUp)만 「받은 auth 로 로그인하고 결과를 돌려준다」로 바꾼다 —
// 계정 만들기 규칙은 signup 스펙 시험이 보고, 여기서는 라우트가 그 로그인의 쿠키를 어떻게 쓰는지만 본다.

const requestCookies = new Map<string, string>();
const sets: { name: string; value: string; options?: CookieOptions }[] = [];
let signInPassword = true;

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
vi.mock("@/features/signup/model/sign-up", () => ({
  signUp: async (deps: { auth: { signInWithPassword(c: { email: string; password: string }): PromiseLike<{ error: unknown }> } }) => {
    if (!signInPassword) return { ok: true, loggedIn: false, mailSent: false };
    const { error } = await deps.auth.signInWithPassword({ email: "fan@login.fankkuk.invalid", password: "pw-1234" });
    return { ok: true, loggedIn: !error, mailSent: false };
  },
}));

const { POST } = await import("./route");

const SITE = "http://127.0.0.1:3000";
function post(): NextRequest {
  const headers: Record<string, string> = { origin: SITE, host: "127.0.0.1:3000", "content-type": "application/json" };
  return new NextRequest(`${SITE}/api/signup`, { method: "POST", headers, body: JSON.stringify({}) });
}
const authWrites = () => sets.filter((s) => s.name.startsWith(UNIT_AUTH_COOKIE) && s.value !== "");
const markerWrites = () => sets.filter((s) => s.name === SESSION_ONLY_COOKIE);

beforeEach(() => {
  requestCookies.clear();
  sets.length = 0;
  signInPassword = true;
  vi.stubEnv("SUPABASE_URL", UNIT_CONFIG.url);
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", UNIT_CONFIG.anonKey);
  vi.stubGlobal("fetch", fakeAuthFetch().fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("INV-L15 (S13f): 가입 직후 자동 로그인은 화면 기본값(꺼짐)과 같은 쪽으로 쓴다", () => {
  it("INV-L15 (S13f): 로그인 쿠키에 만료 시각이 없고, 표시 쿠키가 만료 시각 없이 HttpOnly 로 있다", async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ loggedIn: true, mailSent: false });
    expect(authWrites().length).toBeGreaterThan(0);
    for (const c of authWrites()) {
      expect(c.options?.maxAge).toBeUndefined();
      expect(c.options?.expires).toBeUndefined();
    }
    const marker = markerWrites();
    expect(marker).toHaveLength(1);
    expect(marker[0]?.value).toBe("1");
    expect(marker[0]?.options?.httpOnly).toBe(true);
    expect(marker[0]?.options?.sameSite).toBe("lax");
    expect(marker[0]?.options?.maxAge).toBeUndefined();
    expect(marker[0]?.options?.expires).toBeUndefined();
  });

  it("INV-L15 (S13f, 실패경로): 자동 로그인을 못 했으면 표시 쿠키를 건드리지 않는다", async () => {
    signInPassword = false;
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(authWrites()).toEqual([]);
    expect(markerWrites()).toEqual([]);
  });
});
