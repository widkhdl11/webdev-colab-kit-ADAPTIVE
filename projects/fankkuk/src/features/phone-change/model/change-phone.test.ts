import { fakePasswordAttempts } from "@/entities/session/api/password-attempts-fake";
import { PASSWORD_LOCKED_MESSAGE } from "@/entities/session/api/password-attempts";
import { describe, expect, it } from "vitest";
import type { DetachedAuth } from "@/entities/session/api/account-password";
import { CURRENT_PASSWORD_WRONG } from "@/entities/session/model/password-rule";
import { changePhone, checkPhoneChangeStart, PHONE_CHANGE_CLOSED, SAME_AS_CURRENT_PHONE, VERIFY_AGAIN } from "./change-phone";

// signup INV-U12 의 앱 서버 쪽 — 누구의 번호를 바꾸는지, 비밀번호를 먼저 보는지, 운영에서 닫혀 있는지.
// 확인 줄 잠금·번호 유일·기록은 DB 함수(manual 0013)가 한다 — 실제 DB 로 도는 시험은 tests/integration/phone-change.integration.test.ts.

const ME = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const TICKET = "66666666-6666-4666-8666-666666666666";
const CURRENT = "my-current-1";

function fakes(opts: { rpcCode?: string; passwordOk?: boolean; locked?: boolean } = {}) {
  const limiter = fakePasswordAttempts({ locked: opts.locked });
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const detached: DetachedAuth = {
    async signInWithPassword() {
      return opts.passwordOk === false ? { data: { user: null }, error: { message: "bad" } } : { data: { user: { id: ME } }, error: null };
    },
    async signOut() {
      return { error: null };
    },
  };
  const deps = {
    viewer: { userId: ME, role: "fan" as const },
    verifierReady: true,
    admin: {
      async rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args });
        return opts.rpcCode ? { data: null, error: { code: opts.rpcCode } } : { data: "changed", error: null };
      },
    },
    authAdmin: {
      async getUserById(uid: string) {
        return { data: { user: { id: uid, email: "it_me@login.fankkuk.invalid" } }, error: null };
      },
      async updateUserById() {
        return { error: null };
      },
    },
    makeDetachedAuth: () => detached,
    attempts: limiter.attempts,
  };
  return { deps, limiter, rpcCalls };
}

const body = { phone: "010-9000-1234", currentPassword: CURRENT };

describe("INV-U12: 번호 바꾸기는 로그인한 사람 자신의 번호만", () => {
  it("INV-U12 S12: 세션의 사람·쿠키의 번호표·하이픈 뗀 번호로 DB 함수를 부른다 — 본문의 계정·번호표는 읽지 않는다", async () => {
    const { deps, rpcCalls } = fakes();
    const r = await changePhone(deps, { ...body, accountId: OTHER, userId: OTHER, verificationId: "77777777-7777-4777-8777-777777777777" }, TICKET);
    expect(r).toEqual({ ok: true });
    expect(rpcCalls).toEqual([{ fn: "change_my_phone", args: { p_account_id: ME, p_phone: "01090001234", p_verification_id: TICKET } }]);
  });

  it("INV-U12 S12b (실패경로): 지금 비밀번호가 틀리면 DB 함수를 부르지 않는다(본인 확인이 쓰이지 않는다)", async () => {
    const { deps, rpcCalls } = fakes({ passwordOk: false });
    expect(await changePhone(deps, body, TICKET)).toEqual({ ok: false, status: 400, field: "currentPassword", message: CURRENT_PASSWORD_WRONG });
    expect(rpcCalls).toEqual([]);
  });

  it("INV-L14 (S12b): 막힌 아이디면 지금 비밀번호를 확인하지 않고 429·안내, DB 함수도 부르지 않는다", async () => {
    const { deps, rpcCalls, limiter } = fakes({ locked: true });
    expect(await changePhone(deps, body, TICKET)).toEqual({ ok: false, status: 429, field: "currentPassword", message: PASSWORD_LOCKED_MESSAGE });
    expect(rpcCalls).toEqual([]);
    expect(limiter.calls).toEqual(["begin:it_me"]);
  });

  it("INV-U12 (실패경로): 로그인 안 함·번호표 없음·번호 꼴 틀림 → DB 함수를 부르지 않는다", async () => {
    for (const [viewer, b, ticket] of [
      [null, body, TICKET],
      [undefined, body, undefined],
      [undefined, body, "not-a-uuid"],
      [undefined, { ...body, phone: "02-123-4567" }, TICKET],
    ] as const) {
      const { deps, rpcCalls } = fakes();
      const r = await changePhone(viewer === null ? { ...deps, viewer: null } : deps, b, ticket);
      expect(r.ok).toBe(false);
      expect(rpcCalls).toEqual([]);
    }
  });

  it("INV-U12 (실패경로, INV-U9): 문자 창구가 없으면(운영, 문자 대행사 연결 전) 거부", async () => {
    const { deps, rpcCalls } = fakes();
    expect(await changePhone({ ...deps, verifierReady: false }, body, TICKET)).toEqual({ ok: false, status: 503, message: PHONE_CHANGE_CLOSED });
    expect(rpcCalls).toEqual([]);
  });

  it("INV-U12 S12b (실패경로): DB 의 거부를 사람 말로 — 확인을 쓸 수 없음·이미 가입된 번호", async () => {
    expect(await changePhone(fakes({ rpcCode: "FKU01" }).deps, body, TICKET)).toEqual({ ok: false, status: 400, field: "verification", message: VERIFY_AGAIN });
    expect(await changePhone(fakes({ rpcCode: "FKU02" }).deps, body, TICKET)).toEqual({ ok: false, status: 409, field: "phone", message: "이미 가입된 휴대폰 번호입니다." });
    expect(await changePhone(fakes({ rpcCode: "FKU03" }).deps, body, TICKET)).toEqual({ ok: false, status: 400, field: "phone", message: SAME_AS_CURRENT_PHONE });
  });
});

describe("INV-U12: 번호 바꾸기 1단계 — 지금 번호와 같으면 인증번호를 보내기 전에 거부", () => {
  function startFakes(isCurrent: boolean) {
    const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
    const deps = {
      viewer: { userId: ME, role: "fan" as const },
      verifierReady: true,
      admin: {
        async rpc(fn: string, args: Record<string, unknown>) {
          rpcCalls.push({ fn, args });
          return { data: isCurrent, error: null };
        },
      },
    };
    return { deps, rpcCalls };
  }

  it("INV-U12 (실패경로): 지금 번호와 같으면 400 「현재 번호와 같습니다」 — 세션의 사람으로 묻고, 본문의 계정은 읽지 않는다", async () => {
    const { deps, rpcCalls } = startFakes(true);
    expect(await checkPhoneChangeStart(deps, { phone: "010-9000-1234", accountId: OTHER })).toEqual({
      ok: false,
      status: 400,
      field: "phone",
      message: SAME_AS_CURRENT_PHONE,
    });
    expect(rpcCalls).toEqual([{ fn: "is_my_current_phone", args: { p_account_id: ME, p_phone: "01090001234" } }]);
  });

  it("INV-U12: 다른 번호면 통과 — 하이픈 뗀 번호를 돌려준다", async () => {
    expect(await checkPhoneChangeStart(startFakes(false).deps, { phone: "010-9000-1234" })).toEqual({ ok: true, phone: "01090001234" });
  });

  it("INV-U12 (실패경로): 로그인 안 함·창구 없음·번호 꼴 틀림이면 DB 에 묻지 않는다", async () => {
    const cases = [
      [{ viewer: null }, { phone: "010-9000-1234" }, 401],
      [{ verifierReady: false }, { phone: "010-9000-1234" }, 503],
      [{}, { phone: "02-123-4567" }, 400],
    ] as const;
    for (const [patch, b, status] of cases) {
      const { deps, rpcCalls } = startFakes(true);
      expect(await checkPhoneChangeStart({ ...deps, ...patch }, b)).toMatchObject({ ok: false, status });
      expect(rpcCalls).toEqual([]);
    }
  });
});
