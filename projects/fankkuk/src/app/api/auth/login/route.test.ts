// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePasswordAttempts } from "@/entities/session/api/password-attempts-fake";
import { SESSION_ONLY_COOKIE } from "@/shared/api/supabase/session-cookies";

// 로그인 라우트의 겉: 고른 값(keepSignedIn)을 세션 클라이언트에 넘기는지, 성공 응답에 표시 쿠키를 어떻게 쓰는지.
// 로그인 쿠키 자체의 옵션은 세션 클라이언트 시험(session-cookies·server)이 진짜 라이브러리로 본다.
// 여기서 바꾸는 것은 Auth(비밀번호 확인)·횟수 기록 DB 뿐이다.

// 라우트가 쓰기 규칙으로 정한 값(decide 에 넘긴 sessionOnly). 실패 응답이면 요청에 남은 표시(storedSessionOnly)를 넘겨야 한다.
const decided: boolean[] = [];
let passwordOk = true;
let storedSessionOnly = false;

vi.mock("@/shared/api/supabase/server", () => ({
  createDeferredRequestSupabase: async () => ({
    supabase: { auth: { signInWithPassword: async () => ({ error: passwordOk ? null : { code: "invalid_credentials" } }) } },
    storedSessionOnly,
    decide: (sessionOnly: boolean) => {
      decided.push(sessionOnly);
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
function post(body: unknown, cookie?: string): NextRequest {
  const headers: Record<string, string> = { origin: SITE, host: "127.0.0.1:3000", "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`${SITE}/api/auth/login`, { method: "POST", headers, body: JSON.stringify(body) });
}
const markerLines = (res: Response) => res.headers.getSetCookie().filter((l) => l.startsWith(`${SESSION_ONLY_COOKIE}=`));
const creds = { loginId: "byeolbit_fan", password: "pw-1234" };

beforeEach(() => {
  decided.length = 0;
  passwordOk = true;
  storedSessionOnly = false;
});

describe("INV-L15: 로그인 라우트가 고른 값으로 쿠키를 쓴다", () => {
  it("INV-L15 (S13): 끄고 로그인하면 끔으로 쓰기 규칙을 정하고, 표시 쿠키를 만료 시각 없이 HttpOnly 로 쓴다", async () => {
    const res = await POST(post({ ...creds, keepSignedIn: false }));
    expect(res.status).toBe(200);
    expect(decided).toEqual([true]);
    const lines = markerLines(res);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`^${SESSION_ONLY_COOKIE}=1;`));
    expect(lines[0]).toMatch(/httponly/i);
    expect(lines[0]).toMatch(/samesite=lax/i);
    expect(lines[0]).not.toMatch(/max-age|expires/i);
  });

  it("INV-L15 (S13): keepSignedIn 이 없거나 boolean 이 아니면 끔으로 본다", async () => {
    await POST(post(creds));
    await POST(post({ ...creds, keepSignedIn: "true" }));
    await POST(post({ ...creds, keepSignedIn: 1 }));
    expect(decided).toEqual([true, true, true]);
  });

  it("INV-L15 (S13c): 켜고 로그인하면(남은 표시가 있어도) 켬으로 쓰기 규칙을 정하고 표시 쿠키를 지운다", async () => {
    storedSessionOnly = true;
    const res = await POST(post({ ...creds, keepSignedIn: true }, `${SESSION_ONLY_COOKIE}=1`));
    expect(res.status).toBe(200);
    expect(decided).toEqual([false]);
    const lines = markerLines(res);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`^${SESSION_ONLY_COOKIE}=;`));
    expect(lines[0]).toMatch(/max-age=0/i);
  });

  it("INV-L15·INV-L5 (실패경로): 로그인에 실패하면 표시 쿠키를 건드리지 않고, 고른 값과 상관없이 응답이 같다", async () => {
    passwordOk = false;
    const off = await POST(post({ ...creds, keepSignedIn: false }));
    const on = await POST(post({ ...creds, keepSignedIn: true }));
    expect(markerLines(off)).toEqual([]);
    expect(markerLines(on)).toEqual([]);
    expect(off.status).toBe(401);
    expect(on.status).toBe(off.status);
    expect(await on.json()).toEqual(await off.json());
  });

  it("INV-L15 (S13e, 실패경로): 로그인에 실패하면 고른 값이 아니라 요청에 남은 표시로 쓰기 규칙을 정한다", async () => {
    passwordOk = false;
    storedSessionOnly = true;
    await POST(post({ ...creds, keepSignedIn: true }, `${SESSION_ONLY_COOKIE}=1`));
    storedSessionOnly = false;
    await POST(post({ ...creds, keepSignedIn: false }));
    expect(decided).toEqual([true, false]);
  });
});
