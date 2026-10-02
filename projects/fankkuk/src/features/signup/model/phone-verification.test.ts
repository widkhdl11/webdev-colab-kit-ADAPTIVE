import { describe, expect, it } from "vitest";
import type { PhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { checkPhoneVerification, startPhoneVerification, type PhoneVerificationDeps } from "./phone-verification";

const VID = "11111111-2222-4333-8444-555555555555";

function harness(opts: { limitHit?: boolean; txRow?: { phone: string; provider_tx: string } | null; verifier?: PhoneVerifier | null; completeOk?: boolean } = {}) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const requested: string[] = [];
  const verifier: PhoneVerifier | null =
    opts.verifier === undefined
      ? {
          kind: "fake",
          async request(phone) {
            requested.push(phone);
            return { tx: `fake:${phone}:t` };
          },
          async result(tx) {
            return { status: "verified", phone: tx.split(":")[1]! };
          },
        }
      : opts.verifier;
  const deps: PhoneVerificationDeps = {
    verifier,
    admin: {
      async rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args });
        if (fn === "request_phone_verification") {
          return opts.limitHit ? { data: null, error: { code: "FK429" } } : { data: VID, error: null };
        }
        if (fn === "attach_phone_verification_tx") return { data: null, error: null };
        if (fn === "phone_verification_tx") {
          const row = opts.txRow === undefined ? { phone: "01055556666", provider_tx: "fake:01055556666:t" } : opts.txRow;
          return { data: row ? [row] : [], error: null };
        }
        if (fn === "complete_phone_verification") return { data: opts.completeOk ?? true, error: null };
        throw new Error(fn);
      },
    },
  };
  return { deps, rpcCalls, requested };
}

describe("본인 확인 요청", () => {
  it("INV-U10: 한도 기록을 먼저 남기고, 그 뒤에 카카오를 부르고, 거래 값을 단다", async () => {
    const h = harness();
    expect(await startPhoneVerification(h.deps, { phone: "010-5555-6666" })).toEqual({ ok: true, verificationId: VID });
    expect(h.rpcCalls.map((c) => c.fn)).toEqual(["request_phone_verification", "attach_phone_verification_tx"]);
    expect(h.rpcCalls[0]!.args).toEqual({ p_phone: "01055556666" });
    expect(h.rpcCalls[1]!.args).toEqual({ p_id: VID, p_tx: "fake:01055556666:t" });
    expect(h.requested).toEqual(["01055556666"]);
  });

  it("INV-U10 (S10, 실패경로): 한도를 넘으면 카카오를 부르지 않고 429", async () => {
    const h = harness({ limitHit: true });
    expect(await startPhoneVerification(h.deps, { phone: "01055556666" })).toMatchObject({ ok: false, status: 429 });
    expect(h.requested).toEqual([]);
  });

  it("INV-U9 (S9, 실패경로): 확인 창구가 없으면(운영) 기록도 카카오도 없이 503", async () => {
    const h = harness({ verifier: null });
    expect(await startPhoneVerification(h.deps, { phone: "01055556666" })).toMatchObject({ ok: false, status: 503 });
    expect(h.rpcCalls).toEqual([]);
  });

  it("INV-U6: 휴대폰 꼴이 아니면 400", async () => {
    for (const phone of ["02-123-4567", "0105555666677", "abc", 1234]) {
      const h = harness();
      expect(await startPhoneVerification(h.deps, { phone })).toMatchObject({ ok: false, status: 400 });
      expect(h.rpcCalls).toEqual([]);
    }
  });
});

describe("본인 확인 결과", () => {
  it("INV-U1: 서버가 DB 의 거래 값으로 카카오에게 묻고, 카카오가 확인한 번호를 적는다", async () => {
    const h = harness();
    expect(await checkPhoneVerification(h.deps, { verificationId: VID })).toEqual({ ok: true, status: "verified" });
    expect(h.rpcCalls.at(-1)).toEqual({ fn: "complete_phone_verification", args: { p_id: VID, p_verified_phone: "01055556666" } });
  });

  it("INV-U1 (실패경로): 본문에 번호·거래 값·「확인됨」을 넣어도 쓰지 않는다", async () => {
    const h = harness();
    await checkPhoneVerification(h.deps, { verificationId: VID, phone: "01099990000", tx: "fake:01099990000:x", verified: true });
    expect(h.rpcCalls.at(-1)?.args).toEqual({ p_id: VID, p_verified_phone: "01055556666" });
  });

  it("INV-U1 (실패경로): 카카오가 다른 번호를 확인했다고 하면 그 번호를 그대로 넘기고, DB 가 거부해 확인되지 않는다", async () => {
    const h = harness({
      completeOk: false,
      verifier: { kind: "fake", request: async () => ({ tx: "t" }), result: async () => ({ status: "verified", phone: "01099990000" }) },
    });
    expect(await checkPhoneVerification(h.deps, { verificationId: VID })).toMatchObject({ ok: false, status: 400 });
    expect(h.rpcCalls.at(-1)).toEqual({ fn: "complete_phone_verification", args: { p_id: VID, p_verified_phone: "01099990000" } });
  });

  it("INV-U2 (실패경로): 번호표가 없거나 10분이 지났으면 다시 요청하라고 한다", async () => {
    const h = harness({ txRow: null });
    expect(await checkPhoneVerification(h.deps, { verificationId: VID })).toMatchObject({ ok: false, status: 400 });
    expect(h.rpcCalls.some((c) => c.fn === "complete_phone_verification")).toBe(false);
  });

  it("아직 카카오톡에서 누르지 않았으면 대기", async () => {
    const h = harness({
      verifier: { kind: "fake", request: async () => ({ tx: "t" }), result: async () => ({ status: "pending" }) },
    });
    expect(await checkPhoneVerification(h.deps, { verificationId: VID })).toEqual({ ok: true, status: "pending" });
  });

  it("INV-U9 (실패경로): 확인 창구가 없으면 503", async () => {
    const h = harness({ verifier: null });
    expect(await checkPhoneVerification(h.deps, { verificationId: VID })).toMatchObject({ ok: false, status: 503 });
  });
});
