import { describe, expect, it } from "vitest";
import { hashPhoneCode, type PhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { checkPhoneCode, phoneCodeText, startPhoneVerification, type PhoneVerificationDeps } from "./phone-verification";

const SECRET = "k".repeat(40);
const IP = "a".repeat(64);
const VID = "11111111-2222-4333-8444-555555555555";

type Sent = { phone: string; text: string };

function harness(
  opts: { requestError?: string; sendFails?: number; kakao?: "delivered" | "failed" | "throws"; verifier?: PhoneVerifier | null; checkRow?: { result: string; remaining: number } } = {},
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
    admin: {
      async rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args });
        if (fn === "request_phone_code") return opts.requestError ? { data: null, error: { code: opts.requestError } } : { data: null, error: null };
        if (fn === "discard_phone_code") return { data: null, error: null };
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
    expect(args).toMatchObject({ p_id: r.verificationId, p_phone: "01055556666", p_ip_hash: IP });
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
