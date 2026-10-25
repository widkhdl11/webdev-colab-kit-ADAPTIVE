// @vitest-environment node
import type { CookieOptions } from "@supabase/ssr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_ONLY_COOKIE } from "./session-cookies";
import { fakeAuthFetch, UNIT_AUTH_COOKIE, UNIT_CONFIG } from "./session-cookies-fake-auth";

// 라우트 핸들러가 쓰는 세션 클라이언트. Next 의 요청 쿠키 저장소만 메모리로 바꾸고, 라이브러리는 진짜다.

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

const { createRequestSupabase } = await import("./server");

beforeEach(() => {
  requestCookies.clear();
  sets.length = 0;
  vi.stubEnv("SUPABASE_URL", UNIT_CONFIG.url);
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", UNIT_CONFIG.anonKey);
  vi.stubGlobal("fetch", fakeAuthFetch().fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function authWritesAfterSignIn(opts?: { sessionOnly: boolean }) {
  const supabase = await createRequestSupabase(opts);
  await supabase.auth.signInWithPassword({ email: "fan@login.fankkuk.invalid", password: "pw" });
  const w = sets.filter((s) => s.name.startsWith(UNIT_AUTH_COOKIE));
  expect(w.length).toBeGreaterThan(0);
  return w;
}

describe("INV-L15: 라우트의 세션 클라이언트도 같은 표시 판정으로 쓴다", () => {
  it("INV-L15 (S13b): 요청에 표시 쿠키가 있으면 로그인 쿠키를 만료 시각 없이 쓴다", async () => {
    requestCookies.set(SESSION_ONLY_COOKIE, "1");
    for (const c of await authWritesAfterSignIn()) {
      expect(c.options?.maxAge).toBeUndefined();
      expect(c.options?.expires).toBeUndefined();
    }
  });

  it("INV-L15 (S13c): 표시 쿠키가 없으면 만료 시각이 붙는다", async () => {
    for (const c of await authWritesAfterSignIn()) expect(c.options?.maxAge).toBe(400 * 24 * 60 * 60);
  });

  it("INV-L15 (S13c): 로그인처럼 고른 값을 넘기면 남은 표시보다 그 값이 이긴다(켬)", async () => {
    requestCookies.set(SESSION_ONLY_COOKIE, "1");
    for (const c of await authWritesAfterSignIn({ sessionOnly: false })) expect(c.options?.maxAge).toBe(400 * 24 * 60 * 60);
  });

  it("INV-L15 (S13): 고른 값이 끔이면 표시가 아직 없어도 만료 시각 없이 쓴다", async () => {
    for (const c of await authWritesAfterSignIn({ sessionOnly: true })) expect(c.options?.maxAge).toBeUndefined();
  });
});
