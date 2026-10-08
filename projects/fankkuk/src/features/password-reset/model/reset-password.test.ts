import { fakePasswordAttempts } from "@/entities/session/api/password-attempts-fake";
import { PASSWORD_LOCKED_MESSAGE } from "@/entities/session/api/password-attempts";
import { describe, expect, it, vi } from "vitest";
import { PASSWORD_CHANGED_RELOGIN, type DetachedAuth } from "@/entities/session/api/account-password";
import { RESET_LINK_INVALID, resetPassword } from "./reset-password";

// session-login INV-L11 — 실제 DB·Auth 로 도는 시험은 tests/integration/password-reset.integration.test.ts.
// 여기서는 실제 Auth 가 대신 해 주는 일 때문에 통합 시험으로는 드러나지 않는 「우리 코드가 직접 하는 일」을 붙든다:
// 비밀번호를 바꾼 뒤 그 계정의 모든 세션을 직접 끝내는가(Auth 서버도 관리자 키로 바꾸면 끝내 주지만 그 동작에 기대지 않는다).

const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const TOKEN = "a".repeat(64);

function fakes(opts: { globalSignOutErrors?: number; claimCode?: string } = {}) {
  const limiter = fakePasswordAttempts({ locked: false });
  const calls: string[] = [];
  let signOutFailuresLeft = opts.globalSignOutErrors ?? 0;
  const detached: DetachedAuth = {
    async signInWithPassword(c) {
      calls.push(`detached.signIn:${c.password}`);
      return { data: { user: { id: ACCOUNT } }, error: null };
    },
    async signOut(o) {
      calls.push(`detached.signOut:${o.scope}`);
      if (o.scope === "global" && signOutFailuresLeft > 0) {
        signOutFailuresLeft -= 1;
        return { error: { message: "x" } };
      }
      return { error: null };
    },
  };
  const deps = {
    admin: {
      async rpc(fn: string) {
        calls.push(`rpc:${fn}`);
        if (fn === "password_reset_login_id") return { data: "it_owner", error: null };
        if (opts.claimCode) return { data: null, error: { code: opts.claimCode } };
        return { data: ACCOUNT, error: null };
      },
    },
    authAdmin: {
      async getUserById(uid: string) {
        return { data: { user: { id: uid, email: "it_owner@login.fankkuk.invalid" } }, error: null };
      },
      async updateUserById(uid: string) {
        calls.push(`admin.updateUserById:${uid}`);
        return { error: null };
      },
    },
    makeDetachedAuth: () => detached,
    attempts: limiter.attempts,
  };
  return { deps, limiter, calls };
}

const NEW_PW = "new-pass-1234";
const body = { token: TOKEN, password: NEW_PW, passwordConfirm: NEW_PW };

describe("INV-L11: 재설정이 끝나면 그 계정의 모든 세션을 끝낸다", () => {
  it("INV-L11 S9: 링크 미리 보기 → 링크 쓰기 → 링크가 정한 계정의 비밀번호 바꾸기 → 새 비밀번호로 잠깐 로그인해 모든 기기 로그아웃", async () => {
    const { deps, calls } = fakes();
    expect(await resetPassword(deps, { ...body, accountId: "33333333-3333-4333-8333-333333333333" })).toEqual({ ok: true });
    expect(calls).toEqual([
      "rpc:password_reset_login_id",
      "rpc:claim_password_reset",
      `admin.updateUserById:${ACCOUNT}`,
      "detached.signIn:new-pass-1234",
      "detached.signOut:global",
    ]);
  });

  it("INV-L14 (S12c): 재설정이 끝나면 그 아이디의 비밀번호 확인 막힘을 푼다 — 링크가 거부되면 풀지 않는다", async () => {
    const done = fakes();
    expect(await resetPassword(done.deps, body)).toEqual({ ok: true });
    expect(done.limiter.calls).toEqual(["clear:it_owner"]);
    const refused = fakes({ claimCode: "P0002" });
    await resetPassword(refused.deps, body);
    expect(refused.limiter.calls).toEqual([]);
  });

  it("INV-L11 (실패경로): 모든 기기 로그아웃이 한 번 실패하면 한 번 더 해서 끝낸다", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, calls } = fakes({ globalSignOutErrors: 1 });
    expect(await resetPassword(deps, body)).toEqual({ ok: true });
    expect(calls.filter((c) => c === "detached.signOut:global")).toHaveLength(2);
    errors.mockRestore();
  });

  it("INV-L11 (실패경로): 두 번 다 실패하면 「모든 기기에서 로그아웃됐다」고 하지 않고 다시 로그인하라는 문구를 싣는다 — 비밀번호는 이미 바뀌었다", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, calls } = fakes({ globalSignOutErrors: 2 });
    expect(await resetPassword(deps, body)).toEqual({ ok: true, message: PASSWORD_CHANGED_RELOGIN });
    expect(calls.filter((c) => c === "detached.signOut:global")).toHaveLength(2);
    expect(errors).toHaveBeenCalledTimes(2); // 시도마다 로그
    errors.mockRestore();
  });

  it("INV-L11 S9b (실패경로): 링크 쓰기가 거부되면(P0002) 비밀번호를 바꾸지 않는다", async () => {
    const { deps, calls } = fakes({ claimCode: "P0002" });
    expect(await resetPassword(deps, body)).toMatchObject({ ok: false, field: "link", message: RESET_LINK_INVALID });
    expect(calls.some((c) => c.startsWith("admin.updateUserById"))).toBe(false);
  });

  it("INV-L11 (실패경로): 링크 꼴이 아니면 DB 에 묻지도 않는다", async () => {
    const { deps, calls } = fakes();
    expect(await resetPassword(deps, { ...body, token: "../../etc" })).toMatchObject({ ok: false, field: "link" });
    expect(calls).toEqual([]);
  });
});
