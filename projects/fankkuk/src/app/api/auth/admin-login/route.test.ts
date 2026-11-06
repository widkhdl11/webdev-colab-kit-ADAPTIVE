// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePasswordAttempts } from "@/entities/session/api/password-attempts-fake";
import { SESSION_ONLY_COOKIE } from "@/shared/api/supabase/session-cookies";

// 운영자 로그인 라우트의 겉(admin-console INV-K13). 바꾸는 것은 Auth(비밀번호 확인·세션 끝내기)·DB 판정 함수(is_operator·is_owner)·횟수 기록뿐이다.
// 판정 갈래 자체는 features/auth/model/admin-sign-in.test.ts 가 본다. 여기서는 쿠키 쓰기 규칙과 응답 모양만.

const decided: boolean[] = [];
const signOuts: unknown[] = [];
let finishBroken = false;
let passwordOk = true;
let operator = true;
let storedSessionOnly = false;

vi.mock("@/shared/api/supabase/server", () => ({
  createDeferredRequestSupabase: async () => ({
    supabase: {
      auth: {
        signInWithPassword: async () => ({ error: passwordOk ? null : { code: "invalid_credentials" } }),
        signOut: async (o: unknown) => {
          signOuts.push(o);
          return { error: null };
        },
      },
      rpc: async (fn: string) => ({ data: fn === "is_operator" ? operator : false, error: null }),
    },
    storedSessionOnly,
    decide: (sessionOnly: boolean) => {
      decided.push(sessionOnly);
    },
  }),
}));
vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => ({}) }));
vi.mock("@/entities/session/api/password-attempts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/session/api/password-attempts")>()),
  passwordAttemptsOf: () => {
    const { attempts } = fakePasswordAttempts();
    if (!finishBroken) return attempts;
    return { ...attempts, finish: async () => { throw new Error("기록 DB 오류"); } };
  },
}));

const { POST } = await import("./route");

const SITE = "http://127.0.0.1:3000";
function post(body: unknown, origin = SITE): NextRequest {
  return new NextRequest(`${SITE}/api/auth/admin-login`, {
    method: "POST",
    headers: { origin, host: "127.0.0.1:3000", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const markerLines = (res: Response) => res.headers.getSetCookie().filter((l) => l.startsWith(`${SESSION_ONLY_COOKIE}=`));
const creds = { loginId: "fankkuk_admin", password: "pw-1234" };

beforeEach(() => {
  decided.length = 0;
  signOuts.length = 0;
  finishBroken = false;
  passwordOk = true;
  operator = true;
  storedSessionOnly = false;
});

describe("INV-K13: 운영자 로그인 라우트", () => {
  it("INV-K13 (S13d): 유지를 켜서 보내도 브라우저를 닫으면 끝나는 쿠키로 쓴다", async () => {
    const res = await POST(post({ ...creds, keepSignedIn: true, next: "/admin/pricing" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, next: "/admin/pricing" });
    expect(decided).toEqual([true]);
    const lines = markerLines(res);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`^${SESSION_ONLY_COOKIE}=1;`));
    expect(lines[0]).not.toMatch(/max-age|expires/i);
  });

  it("INV-K13 (S13b, 실패경로): 운영자가 아니면 세션을 끝내고 틀린 비밀번호와 같은 응답 — 표시 쿠키도 쓰지 않는다", async () => {
    operator = false;
    const notOperator = await POST(post(creds));
    expect(signOuts).toEqual([{ scope: "local" }]);
    passwordOk = false;
    const wrong = await POST(post(creds));
    expect(notOperator.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await notOperator.json()).toEqual(await wrong.json());
    expect(markerLines(notOperator)).toEqual([]);
    // 운영자 아님은 쓰기 규칙을 정하지 않는다(미뤄 둔 로그인 쿠키를 버린다) · 틀린 비밀번호는 일반 로그인처럼 남은 표시 그대로
    expect(decided).toEqual([false]);
  });

  it("INV-K13 (S13b, 실패경로): 비밀번호 확인 뒤 횟수 기록이 실패해도 세션을 끝내고 미뤄 둔 로그인 쿠키를 쓰지 않는다", async () => {
    finishBroken = true;
    await expect(POST(post(creds))).rejects.toThrow();
    expect(signOuts).toEqual([{ scope: "local" }]);
    expect(decided).toEqual([]);
  });

  it("INV-K13 (실패경로): 다른 사이트에서 온 요청은 로그인을 시도하지 않고 403", async () => {
    const res = await POST(post(creds, "https://evil.example"));
    expect(res.status).toBe(403);
    expect(decided).toEqual([]);
  });
});
