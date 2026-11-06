// @vitest-environment node
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakePasswordAttempts } from "@/entities/session/api/password-attempts-fake";
import { RESET_TICKET_COOKIE, RESET_VERIFICATION_COOKIE, resetCookieOptions } from "@/features/password-reset/lib/reset-cookies";
import { RESET_CODE_AGAIN, RESET_CODE_SENT_MESSAGE, RESET_TICKET_EXPIRED } from "@/features/password-reset/model/reset-messages";
import type { PhoneVerifier } from "@/shared/api/phone-verifier/verifier";

// 휴대폰 비밀번호 찾기 세 라우트(session-login INV-L10·L11) — 받기·확인·새 비밀번호 저장.
// 인증번호 함수(가입과 같은 것)·번호 해시·재설정 함수는 진짜다. 바꾸는 것은 Next 의 쿠키 저장소(메모리)·DB(rpc 기록)·문자 창구·Auth 뿐이다.

const requestCookies = new Map<string, string>();
const sets: { name: string; value: string; options?: CookieOptions }[] = [];
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const kakaoTo: string[] = [];
const updated: string[] = [];
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const db = { target: true, requestError: null as string | null, checkResult: "verified", issued: "issued", claimCode: null as string | null };

vi.mock("server-only", () => ({}));
// 응답 뒤 할 일(next/server 의 after) — 모아 두었다가 시험이 직접 돌린다. 응답 전에 무엇을 했는지와 뒤에 한 일을 가른다
const afterTasks: (() => unknown)[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void afterTasks.push(task),
}));
async function runAfterTasks(): Promise<void> {
  for (const task of afterTasks.splice(0)) await task();
}
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (requestCookies.has(name) ? { name, value: requestCookies.get(name) ?? "" } : undefined),
    getAll: () => [...requestCookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: CookieOptions) => {
      sets.push({ name, value, options });
    },
  }),
}));
vi.mock("@/shared/api/supabase/admin", () => ({
  createAdminSupabase: () => ({
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === "request_phone_code") return db.requestError ? { data: null, error: { code: db.requestError } } : { data: null, error: null };
      if (fn === "password_reset_target") return { data: db.target, error: null };
      if (fn === "check_phone_code") return { data: [{ result: db.checkResult, remaining: 4 }], error: null };
      if (fn === "issue_phone_password_reset") return { data: db.issued, error: null };
      if (fn === "password_reset_login_id") return { data: "it_owner", error: null };
      if (fn === "claim_password_reset") return db.claimCode ? { data: null, error: { code: db.claimCode } } : { data: ACCOUNT, error: null };
      throw new Error(`모르는 함수 ${fn}`);
    },
    auth: {
      admin: {
        async getUserById(uid: string) {
          return { data: { user: { id: uid, email: "it_owner@login.fankkuk.invalid" } }, error: null };
        },
        async updateUserById(uid: string) {
          updated.push(uid);
          return { error: null };
        },
      },
    },
  }),
}));
vi.mock("@/shared/api/supabase/detached", () => ({
  createDetachedAuth: () => ({
    signInWithPassword: async () => ({ data: { user: { id: ACCOUNT } }, error: null }),
    signOut: async () => ({ error: null }),
  }),
}));
vi.mock("@/entities/session/api/password-attempts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/session/api/password-attempts")>()),
  passwordAttemptsOf: () => fakePasswordAttempts().attempts,
}));
const fakeVerifier: PhoneVerifier = {
  kind: "fake",
  fixedCode: "000000",
  async sendKakaoCode(phone) {
    kakaoTo.push(phone);
    return true;
  },
  async sendSms() {},
};
vi.mock("@/shared/api/phone-verifier/verifier", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api/phone-verifier/verifier")>()),
  choosePhoneVerifier: () => fakeVerifier,
}));

const codeRoute = await import("./code/route");
const checkRoute = await import("./code/check/route");
const saveRoute = await import("./route");

const SITE = "http://127.0.0.1:3000";
function post(path: string, body: unknown): NextRequest {
  const headers: Record<string, string> = { origin: SITE, host: "127.0.0.1:3000", "content-type": "application/json" };
  return new NextRequest(`${SITE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}
const requestCode = (phone: string) => codeRoute.POST(post("/api/auth/password/reset/code", { phone }));
const checkCode = (body: unknown) => checkRoute.POST(post("/api/auth/password/reset/code/check", body));
const save = (body: unknown) => saveRoute.POST(post("/api/auth/password/reset", body));
const written = (name: string) => sets.filter((s) => s.name === name);
const PHONE = "010-5555-6666";
const VID = "11111111-2222-4333-8444-555555555555";
const NEW_PW = "new-pass-1234!";

beforeEach(() => {
  requestCookies.clear();
  sets.length = 0;
  rpcCalls.length = 0;
  kakaoTo.length = 0;
  afterTasks.length = 0;
  updated.length = 0;
  Object.assign(db, { target: true, requestError: null, checkResult: "verified", issued: "issued", claimCode: null });
  vi.stubEnv("FANKKUK_PHONE_ENC_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("FANKKUK_PHONE_HASH_KEY", randomBytes(32).toString("base64"));
});

describe("INV-L10: 인증번호 받기 라우트 — 가입 여부와 상관없이 같은 응답", () => {
  it("INV-L10 S8 (실패경로): 가입된 번호와 가입 안 된 번호(운영자 번호 포함 — DB 가 false) — 같은 상태 코드·같은 본문·같은 쿠키, 알림톡은 가입된 번호에만", async () => {
    db.target = false;
    const none = await requestCode(PHONE);
    const noneBody = await none.json();
    const noneCookies = written(RESET_VERIFICATION_COOKIE);
    // 응답 전에 한 일 — 기록 한 줄뿐(계정 확인·발송은 응답 뒤). 응답 시간으로 가입 여부가 드러나지 않게(보안 리뷰 2026-11-06)
    const noneBefore = rpcCalls.map((c) => c.fn);
    expect(noneBefore).toEqual(["request_phone_code"]);
    await runAfterTasks();
    expect(kakaoTo).toEqual([]);

    sets.length = 0;
    rpcCalls.length = 0;
    db.target = true;
    const one = await requestCode(PHONE);
    expect(rpcCalls.map((c) => c.fn)).toEqual(noneBefore);
    expect(kakaoTo).toEqual([]); // 가입된 번호도 응답 전에는 보내지 않았다
    expect(one.status).toBe(none.status);
    expect(await one.json()).toEqual(noneBody);
    expect(noneBody).toEqual({ message: RESET_CODE_SENT_MESSAGE });
    await runAfterTasks();
    expect(kakaoTo).toEqual(["01055556666"]);
    expect(none.status).toBe(200);
    expect(none.headers.get("cache-control")).toBe("no-store");

    // 둘 다 번호표 쿠키를 같은 옵션으로 쓴다(값만 다르다)
    const oneCookies = written(RESET_VERIFICATION_COOKIE);
    expect(noneCookies).toHaveLength(1);
    expect(oneCookies).toHaveLength(1);
    expect(oneCookies[0]!.options).toEqual(noneCookies[0]!.options);
    expect(oneCookies[0]!.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/api/auth/password/reset" });
  });

  it("INV-L10 S8b (실패경로): 1분 안 두 번째·하루 여섯 번째(한도 초과)도 같은 200·같은 본문, 인증번호는 보내지 않는다", async () => {
    for (const code of ["FK428", "FK429"]) {
      db.requestError = code;
      const r = await requestCode(PHONE);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ message: RESET_CODE_SENT_MESSAGE });
    }
    await runAfterTasks();
    expect(kakaoTo).toEqual([]);
  });

  it("INV-L10 (실패경로): 숫자 번호는 DB 인자 어디에도 없다 — 번호 해시만", async () => {
    await requestCode(PHONE);
    await runAfterTasks(); // 계정 확인은 응답 뒤에 한다
    expect(rpcCalls.map((c) => c.fn)).toEqual(["request_phone_code", "password_reset_target"]);
    expect(JSON.stringify(rpcCalls)).not.toMatch(/01055556666|5555-6666|55556666/);
    expect(rpcCalls[1]!.args.p_phone_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rpcCalls[1]!.args.p_phone_hash).toBe(rpcCalls[0]!.args.p_phone);
  });

  it("INV-L10 (실패경로): 번호 꼴이 틀리면 400 — 쿠키·DB 없음", async () => {
    const r = await requestCode("02-123-4567");
    expect(r.status).toBe(400);
    expect(rpcCalls).toEqual([]);
    expect(written(RESET_VERIFICATION_COOKIE)).toEqual([]);
  });

  it("INV-L10 (실패경로): 다른 사이트에서 온 요청은 본문을 읽지 않고 403", async () => {
    const r = await codeRoute.POST(
      new NextRequest(`${SITE}/api/auth/password/reset/code`, {
        method: "POST",
        headers: { origin: "https://evil.example", host: "127.0.0.1:3000", "content-type": "application/json" },
        body: JSON.stringify({ phone: PHONE }),
      }),
    );
    expect(r.status).toBe(403);
    expect(rpcCalls).toEqual([]);
  });
});

describe("INV-L11: 인증번호 확인 라우트 — 재설정 표는 쿠키로만", () => {
  it("INV-L11: 맞으면 64자 표를 DB 에 넘기고 같은 값을 httpOnly 쿠키로만 준다 — 응답 본문에 표가 없다", async () => {
    requestCookies.set(RESET_VERIFICATION_COOKIE, VID);
    const r = await checkCode({ phone: PHONE, code: "000000" });
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toMatch(/[0-9a-f]{64}/);
    const issue = rpcCalls.find((c) => c.fn === "issue_phone_password_reset");
    expect(issue?.args.p_verification_id).toBe(VID);
    expect(issue?.args.p_token).toMatch(/^[0-9a-f]{64}$/);
    const ticket = written(RESET_TICKET_COOKIE);
    expect(ticket).toHaveLength(1);
    expect(ticket[0]!.value).toBe(issue?.args.p_token);
    expect(ticket[0]!.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/api/auth/password/reset", maxAge: 600 });
    // 다 쓴 번호표 쿠키는 지운다
    expect(written(RESET_VERIFICATION_COOKIE).at(-1)).toMatchObject({ value: "", options: { maxAge: 0 } });
    expect(JSON.stringify(rpcCalls)).not.toMatch(/01055556666/);
  });

  it("INV-L11 (실패경로): DB 가 invalid 면 표 쿠키 없이 「인증번호를 다시 받아 주세요.」", async () => {
    requestCookies.set(RESET_VERIFICATION_COOKIE, VID);
    db.issued = "invalid";
    const r = await checkCode({ phone: PHONE, code: "000000" });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ message: RESET_CODE_AGAIN });
    expect(written(RESET_TICKET_COOKIE)).toEqual([]);
  });

  it("INV-L10 S8b (실패경로): 틀린 숫자는 가입 3단계와 같은 응답(남은 횟수) — 표 없음", async () => {
    requestCookies.set(RESET_VERIFICATION_COOKIE, VID);
    db.checkResult = "wrong";
    const r = await checkCode({ phone: PHONE, code: "123456" });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ reason: "wrong", remaining: 4 });
    expect(rpcCalls.some((c) => c.fn === "issue_phone_password_reset")).toBe(false);
    expect(written(RESET_TICKET_COOKIE)).toEqual([]);
  });

  it("INV-L11 (실패경로): 번호표 쿠키가 없으면 본문에 번호표를 실어도 확인하지 않는다", async () => {
    const r = await checkCode({ phone: PHONE, code: "000000", verificationId: VID });
    expect(r.status).toBe(400);
    expect(rpcCalls).toEqual([]);
    expect(written(RESET_TICKET_COOKIE)).toEqual([]);
  });
});

describe("INV-L11: 새 비밀번호 저장 라우트 — 표는 쿠키에서만", () => {
  it("INV-L11 S9: 표 쿠키로 저장하면 그 계정 비밀번호를 바꾸고 표 쿠키를 지운다", async () => {
    const token = "a".repeat(64);
    requestCookies.set(RESET_TICKET_COOKIE, token);
    const r = await save({ password: NEW_PW, passwordConfirm: NEW_PW });
    expect(r.status).toBe(200);
    expect(updated).toEqual([ACCOUNT]);
    expect(rpcCalls.find((c) => c.fn === "claim_password_reset")?.args).toEqual({ p_token: token });
    expect(written(RESET_TICKET_COOKIE).at(-1)).toMatchObject({ value: "", options: { maxAge: 0, path: "/api/auth/password/reset" } });
  });

  it("INV-L11 S9b (실패경로): 표 쿠키가 없으면 본문의 표를 읽지 않고 거부 — 비밀번호 그대로", async () => {
    const r = await save({ token: "a".repeat(64), password: NEW_PW, passwordConfirm: NEW_PW });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ field: "ticket", message: RESET_TICKET_EXPIRED });
    expect(rpcCalls).toEqual([]);
    expect(updated).toEqual([]);
  });

  it("INV-L11 S9b (실패경로): 만료·이미 쓴 표(P0002)는 거부, 비밀번호 그대로, 표 쿠키를 지운다", async () => {
    requestCookies.set(RESET_TICKET_COOKIE, "a".repeat(64));
    db.claimCode = "P0002";
    const r = await save({ password: NEW_PW, passwordConfirm: NEW_PW });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ field: "ticket", message: RESET_TICKET_EXPIRED });
    expect(updated).toEqual([]);
    expect(written(RESET_TICKET_COOKIE).at(-1)).toMatchObject({ value: "", options: { maxAge: 0 } });
  });

  it("INV-L11 (실패경로): 비밀번호를 잘못 적으면 거부하되 표 쿠키는 남긴다 — 다시 적을 수 있게", async () => {
    requestCookies.set(RESET_TICKET_COOKIE, "a".repeat(64));
    const r = await save({ password: "short", passwordConfirm: "short" });
    expect(r.status).toBe(400);
    expect(written(RESET_TICKET_COOKIE)).toEqual([]);
  });
});

describe("INV-L11: 쿠키 옵션", () => {
  it("INV-L11: 운영에서는 Secure, 로컬은 아니다", () => {
    expect(resetCookieOptions({ NODE_ENV: "production" }, 600).secure).toBe(true);
    expect(resetCookieOptions({ NODE_ENV: "development" }, 600).secure).toBe(false);
  });
});

describe("INV-L10 S8c: 옛 아이디+이메일 재설정 길은 없다", () => {
  it("INV-L10 S8c (실패경로): 옛 요청 라우트·옛 메일 링크 화면 파일이 없다(Next 는 파일이 없으면 404)", () => {
    const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
    expect(existsSync(here("../reset-request/route.ts"))).toBe(false);
    expect(existsSync(here("../../../../(site)/password/reset/page.tsx"))).toBe(false);
    // 경로 계산이 맞는지 — 같은 계산으로 지금 화면은 찾는다
    expect(existsSync(here("../../../../(site)/password/forgot/page.tsx"))).toBe(true);
  });
});
