// @vitest-environment node
import type { CookieMethodsServer, CookieOptions } from "@supabase/ssr";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSessionClient,
  isSessionOnly,
  SESSION_ONLY_COOKIE,
  sessionCookieOptions,
  sessionOnlyMarker,
  sessionOnlyWriteOptions,
} from "./session-cookies";
import { fakeAuthFetch, UNIT_AUTH_COOKIE, UNIT_CONFIG } from "./session-cookies-fake-auth";

describe("INV-L1: 로그인 토큰 쿠키는 스크립트가 읽을 수 없다", () => {
  it("INV-L1 (S1): 개발 환경에서도 HttpOnly·SameSite=Lax 다", () => {
    expect(sessionCookieOptions({ NODE_ENV: "development" })).toEqual({ path: "/", sameSite: "lax", httpOnly: true, secure: false });
  });

  it("INV-L1: 운영 환경(NODE_ENV 또는 VERCEL_ENV)에서는 Secure 가 붙는다", () => {
    expect(sessionCookieOptions({ NODE_ENV: "production" }).secure).toBe(true);
    expect(sessionCookieOptions({ NODE_ENV: "development", VERCEL_ENV: "production" }).secure).toBe(true);
    expect(sessionCookieOptions({ NODE_ENV: "production" }).httpOnly).toBe(true);
  });
});

// 쿠키를 브라우저 대신 메모리에 둔다. 무엇이 어떤 옵션으로 쓰였는지 모두 적어 둔다.
type Write = { name: string; value: string; options: CookieOptions };
function memoryJar(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const writes: Write[] = [];
  const methods: CookieMethodsServer = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (list) => {
      for (const c of list) {
        writes.push({ name: c.name, value: c.value, options: { ...c.options } });
        if (c.options.maxAge === 0) jar.delete(c.name);
        else jar.set(c.name, c.value);
      }
    },
  };
  return { jar, writes, methods };
}

const dev = { NODE_ENV: "development" };
const LIBRARY_MAX_AGE = 400 * 24 * 60 * 60;
const authWrites = (writes: Write[]) => writes.filter((w) => w.name.startsWith(UNIT_AUTH_COOKIE));

afterEach(() => {
  vi.unstubAllGlobals();
});

async function signInWith(sessionOnly: boolean) {
  const fake = fakeAuthFetch();
  vi.stubGlobal("fetch", fake.fetch);
  const { jar, writes, methods } = memoryJar();
  const client = createSessionClient(UNIT_CONFIG, methods, dev, { sessionOnly });
  const { error } = await client.auth.signInWithPassword({ email: "fan@login.fankkuk.invalid", password: "pw-1234" });
  expect(error).toBeNull();
  return { client, jar, writes, fake };
}

describe("INV-L15: 「로그인 상태 유지」를 끄면 로그인 쿠키에 만료 시각이 없다", () => {
  it("INV-L15 (S13): 끄고 로그인하면 라이브러리가 400일을 붙여도 로그인 쿠키에 Max-Age·Expires 가 없고 HttpOnly 다", async () => {
    const { writes, fake } = await signInWith(true);
    expect(fake.calls.some((u) => u.includes("grant_type=password"))).toBe(true);
    const w = authWrites(writes);
    expect(w.length).toBeGreaterThan(0);
    for (const c of w) {
      expect(c.value).not.toBe("");
      expect(c.options.maxAge).toBeUndefined();
      expect(c.options.expires).toBeUndefined();
      expect(c.options.httpOnly).toBe(true);
      expect(c.options.sameSite).toBe("lax");
    }
  });

  it("INV-L15 (S13c): 켜고 로그인하면 라이브러리 기본 만료(400일)가 그대로 붙는다", async () => {
    const { writes } = await signInWith(false);
    const w = authWrites(writes);
    expect(w.length).toBeGreaterThan(0);
    for (const c of w) expect(c.options.maxAge).toBe(LIBRARY_MAX_AGE);
  });

  it("INV-L15 (S13c): 넷째 인자를 안 주면 지금처럼 유지(만료 시각이 붙는다)", async () => {
    vi.stubGlobal("fetch", fakeAuthFetch().fetch);
    const { writes, methods } = memoryJar();
    await createSessionClient(UNIT_CONFIG, methods, dev).auth.signInWithPassword({ email: "fan@login.fankkuk.invalid", password: "pw" });
    expect(authWrites(writes).length).toBeGreaterThan(0);
    for (const c of authWrites(writes)) expect(c.options.maxAge).toBe(LIBRARY_MAX_AGE);
  });

  it("INV-L15·INV-L7 (S13d, 실패경로): 끄고 로그인한 뒤 로그아웃하면 지우는 쓰기(만료 0)는 떼지 않아 쿠키가 지워진다", async () => {
    const { client, jar, writes } = await signInWith(true);
    expect([...jar.keys()].some((n) => n.startsWith(UNIT_AUTH_COOKIE))).toBe(true);
    const before = writes.length;
    await client.auth.signOut({ scope: "local" });
    const removals = authWrites(writes.slice(before));
    expect(removals.length).toBeGreaterThan(0);
    for (const c of removals) expect(c.options.maxAge).toBe(0);
    expect([...jar.keys()].some((n) => n.startsWith(UNIT_AUTH_COOKIE))).toBe(false);
  });
});

describe("INV-L15: 쿠키 쓰기 옵션 — 끔이면 만료 시각만 떼고 지우기는 그대로", () => {
  const base = { path: "/", sameSite: "lax", httpOnly: true, secure: false } as const;

  it("INV-L15: 끔이면 maxAge 를 뗀다", () => {
    expect(sessionOnlyWriteOptions({ ...base, maxAge: LIBRARY_MAX_AGE }, true)).toEqual(base);
  });

  it("INV-L15: 끔이면 expires 도 뗀다", () => {
    expect(sessionOnlyWriteOptions({ ...base, expires: new Date(Date.now() + 86_400_000) }, true)).toEqual(base);
  });

  it("INV-L15 (실패경로): 끔이어도 만료 0(지우기)은 그대로 둔다", () => {
    expect(sessionOnlyWriteOptions({ ...base, maxAge: 0 }, true)).toEqual({ ...base, maxAge: 0 });
  });

  it("INV-L15: 켬이면 아무것도 떼지 않는다", () => {
    const expires = new Date(Date.now() + 86_400_000);
    expect(sessionOnlyWriteOptions({ ...base, maxAge: LIBRARY_MAX_AGE, expires }, false)).toEqual({ ...base, maxAge: LIBRARY_MAX_AGE, expires });
  });
});

describe("INV-L15: 어느 쪽으로 로그인했는지는 표시 쿠키 하나로 기억한다", () => {
  const store = (entries: Record<string, string>) => ({
    get: (name: string) => (name in entries ? { name, value: entries[name] } : undefined),
  });

  it("INV-L15: 표시 쿠키가 있으면 끔, 없으면 켬", () => {
    expect(isSessionOnly(store({ [SESSION_ONLY_COOKIE]: "1" }))).toBe(true);
    expect(isSessionOnly(store({}))).toBe(false);
    expect(isSessionOnly(store({ [SESSION_ONLY_COOKIE]: "" }))).toBe(false);
  });

  it("INV-L15·INV-L1 (S13): 끔이면 표시 쿠키를 만료 시각 없이 HttpOnly·SameSite=Lax 로 쓴다", () => {
    const m = sessionOnlyMarker(true, dev);
    expect(m).toEqual({ name: SESSION_ONLY_COOKIE, value: "1", options: { path: "/", sameSite: "lax", httpOnly: true, secure: false } });
    expect(isSessionOnly(store({ [m.name]: m.value }))).toBe(true);
  });

  it("INV-L15·INV-L1: 운영에서는 표시 쿠키도 Secure", () => {
    expect(sessionOnlyMarker(true, { NODE_ENV: "production" }).options.secure).toBe(true);
  });

  it("INV-L15 (S13c): 켬이면 표시 쿠키를 지운다(만료 0)", () => {
    const m = sessionOnlyMarker(false, dev);
    expect(m.name).toBe(SESSION_ONLY_COOKIE);
    expect(m.value).toBe("");
    expect(m.options.maxAge).toBe(0);
    expect(m.options.httpOnly).toBe(true);
  });
});
