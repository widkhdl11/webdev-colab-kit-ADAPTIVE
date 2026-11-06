import { describe, expect, it } from "vitest";
import { checkResetCode, requestResetCode, type CheckResetCodeDeps, type RequestResetCodeDeps } from "./phone-reset";
import { RESET_CLOSED, RESET_CODE_AGAIN, RESET_CODE_SENT_MESSAGE } from "./reset-messages";

// session-login INV-L10·L11 의 앱 서버 쪽 — 받기 응답이 하나인지, 인증번호를 맞힌 뒤 재설정 표를 어떻게 발급하는지.
// 인증번호 받기·확인 자체(한도·해시·알림톡→문자)는 가입과 같은 함수(features/signup phone-verification)이고 그 시험이 따로 있다.
// 여기서는 그 함수에 무엇을 넘기고 그 결과를 어떻게 하나의 응답으로 바꾸는지를 본다. 라우트·쿠키는 app/api/auth/password/reset/route.test.ts.

const VID = "11111111-2222-4333-8444-555555555555";
const HASH = "c".repeat(64);
const TOKEN = "d".repeat(64);

type StartReply = Awaited<ReturnType<RequestResetCodeDeps["start"]>>;

function requestFakes(reply: StartReply, target = true) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  let sendIfAnswer: boolean | null = null;
  let keep: boolean | undefined;
  const deps: RequestResetCodeDeps = {
    admin: {
      async rpc(fn, args) {
        rpcCalls.push({ fn, args });
        return { data: target, error: null };
      },
    },
    async start(_body, options) {
      keep = options.keepOnSendFail;
      sendIfAnswer = await options.sendIf(HASH);
      return reply;
    },
  };
  return { deps, rpcCalls, sendIf: () => sendIfAnswer, keep: () => keep };
}

describe("INV-L10: 비밀번호 찾기 인증번호 받기 — 응답은 하나", () => {
  it("INV-L10 S8 (실패경로): 가입 안 된 번호·운영자 번호(DB 가 false)와 가입된 번호(true) — 같은 상태 코드·같은 문구", async () => {
    const none = requestFakes({ ok: true, verificationId: VID }, false);
    const one = requestFakes({ ok: true, verificationId: VID }, true);
    const a = await requestResetCode(none.deps, { phone: "010-1234-5678" });
    const b = await requestResetCode(one.deps, { phone: "010-1234-5678" });
    expect(a).toEqual({ status: 200, message: RESET_CODE_SENT_MESSAGE, verificationId: VID });
    expect(b).toEqual(a);
    expect(none.sendIf()).toBe(false);
    expect(one.sendIf()).toBe(true);
  });

  it("INV-L10: 보낼지는 DB 함수 password_reset_target 에 번호 해시로만 묻고, 보내기에 실패해도 인증번호를 버리지 않게 한다", async () => {
    const h = requestFakes({ ok: true, verificationId: VID });
    await requestResetCode(h.deps, { phone: "010-1234-5678" });
    expect(h.rpcCalls).toEqual([{ fn: "password_reset_target", args: { p_phone_hash: HASH } }]);
    expect(h.keep()).toBe(true);
  });

  it("INV-L10 S8b (실패경로): 1분 안 두 번째·하루 여섯 번째(한도)도 같은 200·같은 문구 — 번호표만 없다", async () => {
    for (const reason of ["rate_minute", "rate_day"] as const) {
      const h = requestFakes({ ok: false, status: 429, reason, message: "한도" });
      expect(await requestResetCode(h.deps, { phone: "010-1234-5678" })).toEqual({ status: 200, message: RESET_CODE_SENT_MESSAGE, verificationId: null });
    }
  });

  it("INV-L10 (실패경로): 보내기 실패가 올라와도 같은 200 — 실패를 알리면 계정 있는 번호가 드러난다", async () => {
    const h = requestFakes({ ok: false, status: 503, reason: "send_failed", message: "보내지 못함" });
    expect(await requestResetCode(h.deps, { phone: "010-1234-5678" })).toEqual({ status: 200, message: RESET_CODE_SENT_MESSAGE, verificationId: null });
  });

  it("INV-L10 (실패경로): 번호 꼴이 틀리면 400(입력한 사람이 이미 아는 사실), 창구가 없으면 503 — 이 둘만 다르다", async () => {
    const shape = requestFakes({ ok: false, status: 400, reason: "phone", message: "휴대폰 번호를 확인해 주세요." });
    expect(await requestResetCode(shape.deps, { phone: "02-123" })).toEqual({ status: 400, reason: "phone", message: "휴대폰 번호를 확인해 주세요." });
    const closed = requestFakes({ ok: false, status: 503, reason: "closed", message: "현재 회원가입을 이용할 수 없습니다." });
    expect(await requestResetCode(closed.deps, { phone: "010-1234-5678" })).toEqual({ status: 503, reason: "closed", message: RESET_CLOSED });
  });
});

type CheckReply = Awaited<ReturnType<CheckResetCodeDeps["check"]>>;

function checkFakes(reply: CheckReply, issued: unknown = "issued") {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const checked: unknown[] = [];
  const hashed: string[] = [];
  const deps: CheckResetCodeDeps = {
    admin: {
      async rpc(fn, args) {
        rpcCalls.push({ fn, args });
        return { data: issued, error: null };
      },
    },
    async check(body) {
      checked.push(body);
      return reply;
    },
    phoneHashOf(phone) {
      hashed.push(phone);
      return HASH;
    },
    makeToken: () => TOKEN,
  };
  return { deps, rpcCalls, checked, hashed };
}

describe("INV-L11: 인증번호를 맞히면 재설정 표 하나를 발급한다", () => {
  it("INV-L11: 맞으면 번호표·번호 해시·64자 표를 DB 에 넘기고 표를 돌려준다 — 숫자 번호는 DB 인자에 없다", async () => {
    const h = checkFakes({ ok: true });
    expect(await checkResetCode(h.deps, { phone: "010-1234-5678", code: "123456", verificationId: "99999999-2222-4333-8444-555555555555" }, VID)).toEqual({
      ok: true,
      token: TOKEN,
    });
    // 번호표는 쿠키 값만 — 본문의 번호표는 읽지 않는다
    expect(h.checked).toEqual([{ verificationId: VID, code: "123456" }]);
    expect(h.hashed).toEqual(["01012345678"]);
    expect(h.rpcCalls).toEqual([{ fn: "issue_phone_password_reset", args: { p_verification_id: VID, p_phone_hash: HASH, p_token: TOKEN } }]);
    expect(JSON.stringify(h.rpcCalls)).not.toMatch(/01012345678|1234-5678/);
  });

  it("INV-L11 (실패경로): DB 가 invalid(계정 없음·10분 지남·다른 번호)면 표 없이 「인증번호를 다시 받아 주세요.」", async () => {
    const h = checkFakes({ ok: true }, "invalid");
    expect(await checkResetCode(h.deps, { phone: "01012345678", code: "123456" }, VID)).toEqual({
      ok: false,
      status: 400,
      reason: "invalid",
      message: RESET_CODE_AGAIN,
    });
  });

  it("INV-L10 S8b (실패경로): 숫자가 틀린 응답은 확인 함수의 응답 그대로 — 계정이 없는 번호도 같은 길이다", async () => {
    const h = checkFakes({ ok: false, status: 400, reason: "wrong", remaining: 4, message: "인증번호가 맞지 않습니다. 남은 횟수 4회" });
    expect(await checkResetCode(h.deps, { phone: "01012345678", code: "000000" }, VID)).toEqual({
      ok: false,
      status: 400,
      reason: "wrong",
      remaining: 4,
      message: "인증번호가 맞지 않습니다. 남은 횟수 4회",
    });
    expect(h.rpcCalls).toEqual([]);
  });

  it("INV-L11 (실패경로): 번호표 쿠키가 없거나 번호 꼴이 아니면 확인도 발급도 하지 않는다", async () => {
    for (const [body, ticket] of [
      [{ phone: "01012345678", code: "123456" }, undefined],
      [{ phone: "02-1234", code: "123456" }, VID],
      [null, VID],
    ] as const) {
      const h = checkFakes({ ok: true });
      expect(await checkResetCode(h.deps, body, ticket)).toMatchObject({ ok: false, status: 400, reason: "invalid", message: RESET_CODE_AGAIN });
      expect(h.checked).toEqual([]);
      expect(h.rpcCalls).toEqual([]);
    }
  });

  it("INV-L11: 표는 실행마다 새 64자 16진수(기본 만들기)", async () => {
    const h = checkFakes({ ok: true });
    const { makeToken: _ignored, ...deps } = h.deps;
    const a = await checkResetCode(deps, { phone: "01012345678", code: "123456" }, VID);
    const b = await checkResetCode(deps, { phone: "01012345678", code: "123456" }, VID);
    if (!a.ok || !b.ok) throw new Error("발급 실패");
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(a.token).not.toBe(b.token);
  });
});
