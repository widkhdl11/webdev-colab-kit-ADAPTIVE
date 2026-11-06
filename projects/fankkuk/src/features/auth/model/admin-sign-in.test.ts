import { describe, expect, it } from "vitest";
import { fakePasswordAttempts } from "@/entities/session/api/password-attempts-fake";
import { PASSWORD_LOCKED_MESSAGE } from "@/entities/session/api/password-attempts";
import { adminSignIn, type AdminSignInDeps } from "./admin-sign-in";
import { SIGN_IN_FAILED_MESSAGE } from "./sign-in";

// 운영자 로그인(admin-console INV-K13). 비밀번호 확인은 Auth 가짜, 운영자 판정은 DB 함수 자리의 가짜다.
// 보는 것: 운영자가 아니면 세션을 끝내고 틀렸을 때와 같은 응답인지, 돌아갈 곳이 관리자 주소로만 정해지는지.

const dev = { NODE_ENV: "development" };

function deps(opts: { password: "ok" | "wrong"; operator: boolean | "error"; locked?: boolean }) {
  const signOuts: { scope: string }[] = [];
  const operatorAsks: number[] = [];
  const d: AdminSignInDeps = {
    attempts: fakePasswordAttempts({ locked: opts.locked }).attempts,
    auth: {
      async signInWithPassword() {
        return opts.password === "ok" ? { error: null } : { error: { code: "invalid_credentials" } };
      },
      async signOut(o) {
        signOuts.push(o);
        return { error: null };
      },
    },
    env: dev,
    async isOperator() {
      operatorAsks.push(1);
      if (opts.operator === "error") throw new Error("판정 함수 오류");
      return opts.operator;
    },
  };
  return { d, signOuts, operatorAsks };
}

const creds = { loginId: "fankkuk_admin", password: "pw" };

describe("INV-K13: 운영자 로그인은 운영자만", () => {
  it("INV-K13 (S13): 운영자는 로그인되고 가려던 관리자 화면으로 돌아간다", async () => {
    const { d, signOuts } = deps({ password: "ok", operator: true });
    expect(await adminSignIn(d, { ...creds, next: "/admin/metrics?tab=1" })).toEqual({ ok: true, next: "/admin/metrics?tab=1" });
    expect(signOuts).toEqual([]);
  });

  it("INV-K13 (S13b, 실패경로): 운영자가 아니면 비밀번호가 맞아도 이 세션만 끝내고, 틀린 비밀번호와 같은 응답", async () => {
    const wrong = await adminSignIn(deps({ password: "wrong", operator: false }).d, creds);
    const { d, signOuts } = deps({ password: "ok", operator: false });
    const notOperator = await adminSignIn(d, creds);
    expect(notOperator).toEqual(wrong);
    expect(notOperator).toEqual({ ok: false, status: 401, message: SIGN_IN_FAILED_MESSAGE });
    expect(signOuts).toEqual([{ scope: "local" }]);
  });

  it("INV-K13 (S13b, 실패경로): 운영자 판정을 못 읽으면 운영자가 아닌 것으로 — 세션을 끝내고 실패", async () => {
    const { d, signOuts } = deps({ password: "ok", operator: "error" });
    expect(await adminSignIn(d, creds)).toEqual({ ok: false, status: 401, message: SIGN_IN_FAILED_MESSAGE });
    expect(signOuts).toEqual([{ scope: "local" }]);
  });

  it("INV-K13 (실패경로): 세션을 끝내는 호출이 실패해도 응답은 같은 실패", async () => {
    const { d } = deps({ password: "ok", operator: false });
    d.auth.signOut = async () => {
      throw new Error("네트워크");
    };
    expect(await adminSignIn(d, creds)).toEqual({ ok: false, status: 401, message: SIGN_IN_FAILED_MESSAGE });
  });

  it("INV-K13: 비밀번호가 틀리면 운영자 판정을 묻지 않는다 · 막힌 아이디는 일반 로그인과 같은 잠김 응답", async () => {
    const wrong = deps({ password: "wrong", operator: true });
    expect(await adminSignIn(wrong.d, creds)).toEqual({ ok: false, status: 401, message: SIGN_IN_FAILED_MESSAGE });
    expect(wrong.operatorAsks).toEqual([]);
    const locked = deps({ password: "ok", operator: true, locked: true });
    expect(await adminSignIn(locked.d, creds)).toEqual({ ok: false, status: 429, message: PASSWORD_LOCKED_MESSAGE });
  });

  it.each([
    ["/", "/admin"],
    ["//evil.example/admin", "/admin"],
    ["https://evil.example/admin", "/admin"],
    ["/admin/login", "/admin"],
    ["/admin/login?next=/admin/x", "/admin"],
    ["/administrator", "/admin"],
    ["/gifts", "/admin"],
    [undefined, "/admin"],
    ["/admin", "/admin"],
    ["/admin/creators", "/admin/creators"],
    ["/admin/../gifts", "/admin"],
    ["/admin/%2e%2e/gifts", "/admin"],
    ["/admin/./creators?x=1", "/admin/creators?x=1"],
  ])("INV-K13 (S13c, 실패경로): 돌아갈 곳 %s → %s", async (next, expected) => {
    const { d } = deps({ password: "ok", operator: true });
    expect(await adminSignIn(d, { ...creds, next })).toEqual({ ok: true, next: expected });
  });
});
