import { fakePasswordAttempts } from "@/entities/session/api/password-attempts-fake";
import { PASSWORD_LOCKED_MESSAGE } from "@/entities/session/api/password-attempts";
import { describe, expect, it, vi } from "vitest";
import { PASSWORD_CHANGED_RELOGIN, type DetachedAuth } from "@/entities/session/api/account-password";
import { changePassword, CURRENT_PASSWORD_WRONG } from "./change-password";

// session-login INV-L12 — 실제 Auth 로 도는 시험은 tests/integration/password-change.integration.test.ts.
// 여기서는 실제 Auth 가 대신 해 주는 일 때문에 통합 시험으로는 드러나지 않는 「우리 코드가 직접 하는 일」을 붙든다:
// 바꾼 뒤 다른 기기 로그아웃을 직접 부르는가(Auth 서버도 끝내 주지만 설정에 기대지 않는다), 비밀번호는 요청한 사람의 세션으로 바꾸는가.

const USER = "11111111-1111-4111-8111-111111111111";

function fakes(opts: { signOutErrors?: number; currentOk?: boolean; locked?: boolean } = {}) {
  const limiter = fakePasswordAttempts({ locked: opts.locked });
  const calls: string[] = [];
  let signOutFailuresLeft = opts.signOutErrors ?? 0;
  const detached: DetachedAuth = {
    async signInWithPassword() {
      calls.push("detached.signIn");
      return opts.currentOk === false ? { data: { user: null }, error: { message: "bad" } } : { data: { user: { id: USER } }, error: null };
    },
    async signOut(o) {
      calls.push(`detached.signOut:${o.scope}`);
      return { error: null };
    },
  };
  const deps = {
    viewer: { userId: USER, role: "fan" as const },
    authAdmin: {
      async getUserById(uid: string) {
        return { data: { user: { id: uid, email: "it_me@login.fankkuk.invalid" } }, error: null };
      },
      async updateUserById() {
        calls.push("admin.updateUserById");
        return { error: null };
      },
    },
    makeDetachedAuth: () => detached,
    attempts: limiter.attempts,
    sessionAuth: {
      async updateUser() {
        calls.push("session.updateUser");
        return { error: null };
      },
      async signOut(o: { scope: "others" }) {
        calls.push(`session.signOut:${o.scope}`);
        if (signOutFailuresLeft > 0) {
          signOutFailuresLeft -= 1;
          return { error: { message: "x" } };
        }
        return { error: null };
      },
    },
  };
  return { deps, limiter, calls };
}

const OLD_PW = "old-pass-123";
const NEW_PW = "new-pass-1234";
const body = { currentPassword: OLD_PW, newPassword: NEW_PW, newPasswordConfirm: NEW_PW };

describe("INV-L12: 바꾸기는 요청한 사람의 세션으로, 바꾼 뒤 다른 기기 로그아웃", () => {
  it("INV-L12 S10b: 지금 비밀번호 확인(일회용 세션은 바로 끝냄) → 세션으로 바꾸기 → 다른 기기 로그아웃 순서", async () => {
    const { deps, calls } = fakes();
    expect(await changePassword(deps, body)).toEqual({ ok: true });
    expect(calls).toEqual(["detached.signIn", "detached.signOut:local", "session.updateUser", "session.signOut:others"]);
    expect(calls).not.toContain("admin.updateUserById");
  });

  it("INV-L12 (실패경로): 다른 기기 로그아웃이 한 번 실패하면 한 번 더 해서 끝낸다", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, calls } = fakes({ signOutErrors: 1 });
    expect(await changePassword(deps, body)).toEqual({ ok: true });
    expect(calls.filter((c) => c === "session.signOut:others")).toHaveLength(2);
    errors.mockRestore();
  });

  it("INV-L12 (실패경로): 두 번 다 실패하면 「다른 기기에서 로그아웃됐다」고 하지 않고 다시 로그인하라는 문구를 싣는다 — 비밀번호는 이미 바뀌었다", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, calls } = fakes({ signOutErrors: 2 });
    expect(await changePassword(deps, body)).toEqual({ ok: true, message: PASSWORD_CHANGED_RELOGIN });
    expect(calls.filter((c) => c === "session.signOut:others")).toHaveLength(2);
    expect(errors).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });

  it("INV-L12 S10 (실패경로): 지금 비밀번호가 틀리면 바꾸기·로그아웃을 부르지 않는다", async () => {
    const { deps, calls } = fakes({ currentOk: false });
    expect(await changePassword(deps, body)).toMatchObject({ ok: false, message: CURRENT_PASSWORD_WRONG });
    expect(calls).toEqual(["detached.signIn"]);
  });

  it("INV-L14 (S12b): 막힌 아이디면 지금 비밀번호를 확인하지 않고 429·안내 — 맞으면 맞음으로, 틀리면 틀림으로 적는다", async () => {
    const locked = fakes({ locked: true });
    expect(await changePassword(locked.deps, body)).toEqual({ ok: false, status: 429, field: "currentPassword", message: PASSWORD_LOCKED_MESSAGE });
    expect(locked.calls).not.toContain("detached.signIn");
    const right = fakes();
    await changePassword(right.deps, body);
    expect(right.limiter.calls).toEqual(["begin:it_me", "finish:1:true"]);
    const wrong = fakes({ currentOk: false });
    await changePassword(wrong.deps, body);
    expect(wrong.limiter.calls).toEqual(["begin:it_me", "finish:1:false"]);
  });
});
