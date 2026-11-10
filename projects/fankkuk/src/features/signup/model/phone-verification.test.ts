import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { phoneHash, readPhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { hashPhoneCode, type PhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { checkPhoneCode, phoneCodeText, startPhoneVerification, type PhoneVerificationDeps } from "./phone-verification";

const SECRET = "k".repeat(40);
const IP = "a".repeat(64);
const VID = "11111111-2222-4333-8444-555555555555";
const KEYS = readPhoneKeys({ FANKKUK_PHONE_ENC_KEY: randomBytes(32).toString("base64"), FANKKUK_PHONE_HASH_KEY: randomBytes(32).toString("base64") });

type Sent = { phone: string; text: string };

function harness(
  opts: { requestError?: string; sendFails?: number; kakao?: "delivered" | "failed" | "throws"; verifier?: PhoneVerifier | null; checkRow?: { result: string; remaining: number }; carryError?: string } = {},
) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const sent: Sent[] = [];
  const kakaoSent: { phone: string; code: string }[] = [];
  let failuresLeft = opts.sendFails ?? 0;
  // 기본은 알림톡이 안 되는 경우 — 문자 쪽 시험이 그대로 문자를 본다
  const kakao = opts.kakao ?? "failed";
  const verifier: PhoneVerifier | null =
    opts.verifier === undefined
      ? {
          kind: "fake",
          async sendKakaoCode(phone, code) {
            kakaoSent.push({ phone, code });
            if (kakao === "throws") throw new Error("kakao down");
            return kakao === "delivered";
          },
          async sendSms(phone, text) {
            sent.push({ phone, text });
            if (failuresLeft > 0) {
              failuresLeft -= 1;
              throw new Error("send failed");
            }
          },
        }
      : opts.verifier;
  const deps: PhoneVerificationDeps = {
    verifier,
    codeSecret: () => SECRET,
    phoneKeys: () => KEYS,
    admin: {
      async rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args });
        if (fn === "request_phone_code") return opts.requestError ? { data: null, error: { code: opts.requestError } } : { data: null, error: null };
        if (fn === "discard_phone_code") return { data: null, error: null };
        if (fn === "carry_signup_sign_down") return opts.carryError ? { data: null, error: { code: opts.carryError } } : { data: true, error: null };
        if (fn === "check_phone_code") return { data: [opts.checkRow ?? { result: "verified", remaining: 5 }], error: null };
        throw new Error(fn);
      },
    },
  };
  return { deps, rpcCalls, sent, kakaoSent };
}

const codeOf = (text: string) => /인증번호 (\d{6})/.exec(text)?.[1] ?? "";

describe("INV-U9·U15: 가짜 창구의 고정 인증번호", () => {
  it("INV-U15: 문자 본문은 정해진 꼴 하나다", () => {
    expect(phoneCodeText("123456")).toBe("[팬꾹] 인증번호 123456 (3분 안에 입력해 주세요)");
  });

  it("INV-U9: 가짜 창구(fixedCode)면 000000 의 해시를 진짜와 같은 함수로 기록한다", async () => {
    const h = harness({ verifier: { kind: "fake", fixedCode: "000000", sendKakaoCode: async () => true, async sendSms() {} } });
    const r = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP);
    if (!r.ok) throw new Error("요청 실패");
    expect(h.rpcCalls[0]!.args.p_code_hash).toBe(hashPhoneCode(SECRET, r.verificationId, "000000"));
  });

  it("INV-U9 (실패경로): 가짜가 아닌 창구(운영 대행사)에서는 000000 이 통하지 않는다 — 기록된 해시가 000000 의 해시가 아니다", async () => {
    for (let i = 0; i < 5; i += 1) {
      const h = harness({ verifier: { kind: "provider", sendKakaoCode: async () => true, async sendSms() {} } });
      const r = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP);
      if (!r.ok) throw new Error("요청 실패");
      expect(h.rpcCalls[0]!.args.p_code_hash).not.toBe(hashPhoneCode(SECRET, r.verificationId, "000000"));
    }
  });
});

describe("인증번호 요청", () => {
  it("INV-U15: 인증번호는 해시로만 DB 에 넘기고, 원문은 문자로만 나간다 — 응답에도 없다", async () => {
    const h = harness();
    const r = await startPhoneVerification(h.deps, { phone: "010-5555-6666" }, IP);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(["request_phone_code"]);
    const args = h.rpcCalls[0]!.args;
    // signup INV-U18: DB 에는 번호 해시만 — 숫자 번호는 어느 인자에도 없다
    expect(args).toMatchObject({ p_id: r.verificationId, p_phone: phoneHash(KEYS, "01055556666"), p_ip_hash: IP });
    expect(JSON.stringify(args)).not.toContain("01055556666");
    expect(h.sent).toHaveLength(1);
    const code = codeOf(h.sent[0]!.text);
    expect(code).toMatch(/^\d{6}$/);
    expect(h.sent[0]!.phone).toBe("01055556666");
    expect(args.p_code_hash).toBe(hashPhoneCode(SECRET, r.verificationId, code));
    expect(JSON.stringify(args)).not.toContain(code);
    expect(JSON.stringify(r)).not.toContain(code);
  });

  it("INV-U15: 요청마다 다른 번호표·다른 해시", async () => {
    const h = harness();
    const a = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP);
    const b = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP);
    expect(a.ok && b.ok && a.verificationId !== b.verificationId).toBe(true);
    expect(h.rpcCalls[0]!.args.p_code_hash).not.toBe(h.rpcCalls[1]!.args.p_code_hash);
  });

  it("INV-U10 (S10, 실패경로): 1분 한도면 문자를 보내지 않고 429", async () => {
    const h = harness({ requestError: "FK428" });
    expect(await startPhoneVerification(h.deps, { phone: "01055556666" }, IP)).toMatchObject({ ok: false, status: 429 });
    expect(h.sent).toEqual([]);
  });

  it("INV-U10 (S10, 실패경로): 하루 한도(번호·접속 주소)면 문자를 보내지 않고 429", async () => {
    const h = harness({ requestError: "FK429" });
    const r = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP);
    expect(r).toMatchObject({ ok: false, status: 429 });
    expect(h.sent).toEqual([]);
    if (!r.ok) expect(r.message).toContain("오늘");
  });

  it("INV-U15: 발송이 한 번 실패하면 한 번만 다시 보내 본다 — 같은 인증번호로", async () => {
    const h = harness({ sendFails: 1 });
    expect((await startPhoneVerification(h.deps, { phone: "01055556666" }, IP)).ok).toBe(true);
    expect(h.sent).toHaveLength(2);
    expect(h.sent[0]!.text).toBe(h.sent[1]!.text);
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(["request_phone_code"]);
  });

  it("INV-U15 (실패경로): 두 번 다 실패하면 그 인증번호를 버리고 「잠시 후 다시」", async () => {
    const h = harness({ sendFails: 2 });
    const r = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP);
    expect(r).toMatchObject({ ok: false, status: 503, reason: "send_failed" });
    expect(h.sent).toHaveLength(2);
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(["request_phone_code", "discard_phone_code"]);
    expect(h.rpcCalls[1]!.args).toEqual({ p_id: h.rpcCalls[0]!.args.p_id });
  });

  it("INV-U9 (S9, 실패경로): 문자 창구가 없으면(운영) 기록도 문자도 없이 503", async () => {
    const h = harness({ verifier: null });
    expect(await startPhoneVerification(h.deps, { phone: "01055556666" }, IP)).toMatchObject({ ok: false, status: 503 });
    expect(h.rpcCalls).toEqual([]);
  });

  it("INV-U6: 휴대폰 꼴이 아니면 400", async () => {
    for (const phone of ["02-123-4567", "0105555666677", "abc", 1234]) {
      const h = harness();
      expect(await startPhoneVerification(h.deps, { phone }, IP)).toMatchObject({ ok: false, status: 400 });
      expect(h.rpcCalls).toEqual([]);
    }
  });
});

describe("INV-U15 (S15c): 알림톡 먼저, 안 되면 같은 인증번호를 문자로", () => {
  it("INV-U15 (S15c): 알림톡이 도착하면 문자는 안 가고 통로는 kakao", async () => {
    const h = harness({ kakao: "delivered" });
    const r = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP);
    expect(r).toMatchObject({ ok: true, channel: "kakao" });
    expect(h.sent).toEqual([]);
    expect(h.kakaoSent).toHaveLength(1);
    expect(h.kakaoSent[0]!.phone).toBe("01055556666");
    if (r.ok) expect(h.rpcCalls[0]!.args.p_code_hash).toBe(hashPhoneCode(SECRET, r.verificationId, h.kakaoSent[0]!.code));
  });

  it("INV-U15 (S15c, 실패경로): 알림톡 실패면 같은 인증번호가 문자로 가고 통로는 sms — 요청 기록은 한 번", async () => {
    for (const kakao of ["failed", "throws"] as const) {
      const h = harness({ kakao });
      const r = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP);
      expect(r).toMatchObject({ ok: true, channel: "sms" });
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]!.text).toBe(phoneCodeText(h.kakaoSent[0]!.code));
      expect(h.rpcCalls.map((c) => c.fn)).toEqual(["request_phone_code"]);
    }
  });

  it("INV-U15 (실패경로): 알림톡도 문자 두 번도 실패하면 버리고 「잠시 후 다시」 — 통로를 말하지 않는다", async () => {
    const h = harness({ kakao: "failed", sendFails: 2 });
    const r = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP);
    expect(r).toMatchObject({ ok: false, reason: "send_failed" });
    expect(h.kakaoSent).toHaveLength(1);
    expect(h.sent).toHaveLength(2);
  });

  it("INV-U15: 응답에는 인증번호가 없다(알림톡으로 간 때도)", async () => {
    const h = harness({ kakao: "delivered" });
    const r = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP);
    expect(JSON.stringify(r)).not.toContain(h.kakaoSent[0]!.code);
  });
});

describe("인증번호 확인", () => {
  it("INV-U1: 서버가 입력한 6자리를 번호표와 섞어 해시하고 DB 가 비교한다 — 맞으면 확인됨", async () => {
    const h = harness();
    expect(await checkPhoneCode(h.deps, { verificationId: VID, code: "012345" })).toEqual({ ok: true });
    expect(h.rpcCalls).toEqual([{ fn: "check_phone_code", args: { p_id: VID, p_code_hash: hashPhoneCode(SECRET, VID, "012345") } }]);
  });

  it("INV-U1 (실패경로): 본문의 「확인됨」·번호는 읽지 않는다", async () => {
    const h = harness({ checkRow: { result: "wrong", remaining: 4 } });
    const r = await checkPhoneCode(h.deps, { verificationId: VID, code: "000000", verified: true, phone: "01099990000" });
    expect(r).toMatchObject({ ok: false, reason: "wrong" });
    expect(Object.keys(h.rpcCalls[0]!.args)).toEqual(["p_id", "p_code_hash"]);
  });

  it("INV-U10 (S10b, 실패경로): 틀리면 남은 횟수를 알려 주고, 다섯 번째면 다시 받으라고 한다", async () => {
    const wrong = await checkPhoneCode(harness({ checkRow: { result: "wrong", remaining: 3 } }).deps, { verificationId: VID, code: "111111" });
    expect(wrong).toMatchObject({ ok: false, status: 400, reason: "wrong", remaining: 3, message: "인증번호가 맞지 않습니다. 남은 횟수 3회" });
    const locked = await checkPhoneCode(harness({ checkRow: { result: "locked", remaining: 0 } }).deps, { verificationId: VID, code: "111111" });
    expect(locked).toMatchObject({ ok: false, reason: "locked", message: "입력 횟수를 모두 사용했습니다. 인증번호를 다시 받아 주세요." });
  });

  it("INV-U15 (S15b, 실패경로): 3분이 지났거나, 이미 맞혔거나, 새로 받아 버려진 인증번호는 거부", async () => {
    const expired = await checkPhoneCode(harness({ checkRow: { result: "expired", remaining: 5 } }).deps, { verificationId: VID, code: "111111" });
    expect(expired).toMatchObject({ ok: false, reason: "expired", message: "인증 시간이 지났습니다. 인증번호를 다시 받아 주세요." });
    const invalid = await checkPhoneCode(harness({ checkRow: { result: "invalid", remaining: 0 } }).deps, { verificationId: VID, code: "111111" });
    expect(invalid).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("6자리 숫자가 아니면 DB 에 묻지 않는다 — 틀린 횟수도 오르지 않는다", async () => {
    for (const code of ["12345", "1234567", "abcdef", "", 123456]) {
      const h = harness();
      expect(await checkPhoneCode(h.deps, { verificationId: VID, code })).toMatchObject({ ok: false, reason: "shape" });
      expect(h.rpcCalls).toEqual([]);
    }
  });

  it("INV-U1 (S1c, 실패경로): 번호표가 없으면 다시 받으라고 한다", async () => {
    const h = harness();
    expect(await checkPhoneCode(h.deps, { code: "123456" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(h.rpcCalls).toEqual([]);
  });

  it("INV-U9 (실패경로): 문자 창구가 없으면 503", async () => {
    const h = harness({ verifier: null });
    expect(await checkPhoneCode(h.deps, { verificationId: VID, code: "123456" })).toMatchObject({ ok: false, status: 503 });
  });
});

describe("비밀번호 찾기용 선택지 (session-login INV-L10)", () => {
  it("INV-L10: 보낼지 묻는 함수가 false 면 기록은 하고(한도를 센다) 보내지 않으며, 성공과 같은 결과를 돌려준다", async () => {
    const h = harness();
    const asked: string[] = [];
    const r = await startPhoneVerification(h.deps, { phone: "010-5555-6666" }, IP, {
      sendIf: async (hash) => {
        asked.push(hash);
        return false;
      },
      keepOnSendFail: true,
    });
    expect(r.ok).toBe(true);
    expect(asked).toEqual([phoneHash(KEYS, "01055556666")]);
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(["request_phone_code"]);
    expect(h.sent).toHaveLength(0);
    expect(h.kakaoSent).toHaveLength(0);
  });

  it("INV-L10: 보낼지 묻는 함수가 true 면 보낸다", async () => {
    const h = harness();
    const r = await startPhoneVerification(h.deps, { phone: "010-5555-6666" }, IP, { sendIf: async () => true, keepOnSendFail: true });
    expect(r.ok).toBe(true);
    expect(h.sent).toHaveLength(1);
  });

  it("INV-L10 실패경로: 보내기에 실패해도 인증번호를 버리지 않고 성공과 같은 결과 — 계정 있는 번호만 버려지면 응답 차이로 가입 여부가 드러난다", async () => {
    const h = harness({ sendFails: 5 });
    const r = await startPhoneVerification(h.deps, { phone: "010-5555-6666" }, IP, { sendIf: async () => true, keepOnSendFail: true });
    expect(r.ok).toBe(true);
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(["request_phone_code"]);
  });

  // 보안 리뷰(2026-11-06): 가입된 번호만 발송을 기다렸다 응답하면 응답 시간으로 가입 여부가 드러난다 —
  // 미루기 함수를 주면 응답 전에는 기록 한 줄만 하고, 계정 확인·발송은 미룬 일에서 한다.
  it("INV-L10 (실패경로): 미루기 함수를 주면 응답 전에 계정 확인도 발송도 하지 않고, 미룬 일이 돌 때 확인·발송한다", async () => {
    const h = harness();
    const asked: string[] = [];
    const deferred: (() => Promise<void>)[] = [];
    const r = await startPhoneVerification(h.deps, { phone: "010-5555-6666" }, IP, {
      sendIf: async (hash) => {
        asked.push(hash);
        return true;
      },
      keepOnSendFail: true,
      defer: (task) => void deferred.push(task),
    });
    expect(r.ok).toBe(true);
    expect(asked).toEqual([]);
    expect(h.sent).toHaveLength(0);
    expect(h.kakaoSent).toHaveLength(0);
    expect(deferred).toHaveLength(1);
    await deferred[0]!();
    expect(asked).toEqual([phoneHash(KEYS, "01055556666")]);
    expect(h.kakaoSent).toHaveLength(1);
    expect(h.sent).toHaveLength(1); // 알림톡 실패(기본) → 같은 번호를 문자로
  });

  it("INV-L10 (실패경로): 미룬 일에서 계정이 없으면 보내지 않는다 — 응답은 계정이 있을 때와 같다", async () => {
    const run = async (exists: boolean) => {
      const h = harness();
      const deferred: (() => Promise<void>)[] = [];
      const r = await startPhoneVerification(h.deps, { phone: "010-5555-6666" }, IP, {
        sendIf: async () => exists,
        keepOnSendFail: true,
        defer: (task) => void deferred.push(task),
      });
      const before = h.rpcCalls.map((c) => c.fn);
      await deferred[0]!();
      return { r, before, sent: h.sent.length + h.kakaoSent.length };
    };
    const none = await run(false);
    const one = await run(true);
    expect({ ...none.r, verificationId: "x" }).toEqual({ ...one.r, verificationId: "x" });
    expect(none.before).toEqual(one.before);
    expect(none.sent).toBe(0);
    expect(one.sent).toBeGreaterThan(0);
  });

  it("INV-L10 (실패경로): 미룬 발송이 실패해도 인증번호를 버리지 않고 미룬 일은 오류를 밖으로 던지지 않는다", async () => {
    const h = harness({ sendFails: 5 });
    const deferred: (() => Promise<void>)[] = [];
    await startPhoneVerification(h.deps, { phone: "010-5555-6666" }, IP, { sendIf: async () => true, keepOnSendFail: true, defer: (t) => void deferred.push(t) });
    await expect(deferred[0]!()).resolves.toBeUndefined();
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(["request_phone_code"]);
  });

  it("가입(선택지 없음)은 지금처럼 보내기 실패면 버리고 실패를 알린다", async () => {
    const h = harness({ sendFails: 5 });
    const r = await startPhoneVerification(h.deps, { phone: "010-5555-6666" }, IP);
    expect(r.ok).toBe(false);
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(["request_phone_code", "discard_phone_code"]);
  });
});

describe("INV-U20: 장애 대비 길 — 「창구 장애 확인」을 새 번호표로 옮긴다", () => {
  const DOWN_TICKET = "44444444-5555-4666-8777-888888888888";

  it("INV-U20 (S20): 앞 번호표(카카오 서명 요청)를 넘기면 새 인증번호 번호표에 장애 기록을 옮기는 함수를 보내기 전에 부른다 — 옮길지는 DB 가 판정한다", async () => {
    const h = harness();
    const r = await startPhoneVerification(h.deps, { phone: "01055556666" }, IP, { carryDownFrom: DOWN_TICKET });
    if (!r.ok) throw new Error("요청 실패");
    const fns = h.rpcCalls.map((c) => c.fn);
    expect(fns.indexOf("carry_signup_sign_down")).toBeGreaterThan(fns.indexOf("request_phone_code"));
    expect(h.rpcCalls.find((c) => c.fn === "carry_signup_sign_down")?.args).toEqual({ p_from: DOWN_TICKET, p_to: r.verificationId });
    expect(h.kakaoSent.length + h.sent.length).toBeGreaterThan(0);
  });

  it("INV-U20 (실패경로): 앞 번호표가 없거나 꼴이 틀리면 옮기지 않는다. 옮기는 함수가 없어도(SQL 적용 전) 인증번호는 그대로 보낸다 — 크리에이터 가입만 막힌다", async () => {
    for (const carryDownFrom of [undefined, null, "not-a-uuid"]) {
      const h = harness();
      await startPhoneVerification(h.deps, { phone: "01055556666" }, IP, { carryDownFrom });
      expect(h.rpcCalls.some((c) => c.fn === "carry_signup_sign_down")).toBe(false);
    }
    const missing = harness({ carryError: "PGRST202" });
    const r = await startPhoneVerification(missing.deps, { phone: "01055556666" }, IP, { carryDownFrom: DOWN_TICKET });
    expect(r.ok).toBe(true);
  });
});
