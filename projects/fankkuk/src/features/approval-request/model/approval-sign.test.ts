// @vitest-environment node
import { describe, expect, it } from "vitest";
import { APPROVAL_EXPIRED_MESSAGE } from "@/entities/order/config/approval-deadline";
import { buildApprovalPlaintext } from "@/entities/order/model/approval-plaintext";
import type { ApprovalSigner, SignatureResult } from "@/shared/api/approval-signer/signer";
import { APPROVAL_REQUEST_MESSAGE, checkApprovalSign, startApprovalSign } from "./approval-sign";

// approval-signature INV-S2·S7·S11·S12·S17 — 「승인」 누를 때 서명 요청 → 결과 확인 → 승인. DB 판정(원문 대조·기한·한도·주소)은 통합 시험(approval-sign-db)이 본다.
// 여기서는 앱 서버가 지키는 것: 세션의 크리에이터만 · 본문에서 요청 ID 하나만 · 화면이 보낸 서명 값은 읽지 않음 · 서명된 원문을 저장 원문과 다시 대조 ·
// 창구가 없으면 거부 · 창구가 실패하면 요청을 끝냄.

const HARU = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" } as const;
const FAN = { userId: "00000000-0000-4000-a000-000000000001", role: "fan" } as const;
const REQ = "apr_TEST1";
const SIGN = "11111111-2222-4333-8444-555555555555";
const PLAIN = buildApprovalPlaintext({ orderNo: "FC-7K3M9", fanNickname: "별빛", giftKind: "꽃", boxCount: 2 });
const EXP = "2026-10-29T01:05:00.000Z";
const ENV = { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: "A".repeat(344), iv: "c2VlZC1zaWctbG5r", ciphertext: "B".repeat(24) };

type Reply = { data?: unknown; error?: { code: string } | null };
function fakeAdmin(replies: Record<string, Reply | Reply[]>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    admin: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        const r0 = replies[fn];
        const r = Array.isArray(r0) ? (r0.shift() ?? { data: null }) : (r0 ?? { data: null });
        return { data: r.data ?? null, error: r.error ?? null };
      },
    } as never,
  };
}

function spySigner(result: SignatureResult = { state: "pending" }, start: { ok: true; txId: string } | { ok: false } = { ok: true, txId: "tx_1" }) {
  const asked: { requested: unknown[]; results: unknown[] } = { requested: [], results: [] };
  const signer: ApprovalSigner = {
    kind: "fake",
    requestSignature: async (i) => (asked.requested.push(i), start),
    signatureResult: async (i) => (asked.results.push(i), result),
  };
  return { signer, asked };
}

const startRow = (result: string, extra: Record<string, unknown> = {}) => ({
  data: [{ result, sign_request_id: null, plaintext: null, expires_at: null, envelope: null, creator_id: null, ...extra }],
});
const CREATOR = "c0000000-0000-4000-8000-000000000001";
const started = startRow("started", { sign_request_id: SIGN, plaintext: PLAIN, expires_at: EXP, envelope: ENV, creator_id: CREATOR });
const currentRow = (result: string, extra: Record<string, unknown> = {}) => ({
  data: [{ result, sign_request_id: null, state: null, plaintext: null, gateway_tx_id: null, method: null, expires_at: null, ...extra }],
});
const pendingNow = currentRow("found", { sign_request_id: SIGN, state: "pending", plaintext: PLAIN, gateway_tx_id: "tx_1", method: "fake", expires_at: EXP });
const SIGNED: SignatureResult = { state: "signed", method: "fake", signedPlaintext: PLAIN, signature: "sig", signedAt: "2026-10-29T01:02:03.000Z" };

describe("INV-S17: 「승인」을 누를 때 서명 요청을 만든다", () => {
  it("INV-S17 S17: 세션의 크리에이터·요청 ID·창구 방식만 DB 에 넘기고, 창구에 원문·요청 구분 「팬꾹 선물 수령 승인」·봉투를 넘긴 뒤 거래 ID 를 적는다", async () => {
    const f = fakeAdmin({ start_approval_sign: started, record_approval_sign_tx: { data: "recorded" } });
    const s = spySigner();
    const body = { requestId: REQ, actorId: "someone", signedPlaintext: PLAIN, signature: "forged" };
    expect(await startApprovalSign({ admin: f.admin, viewer: HARU, signer: s.signer }, body)).toEqual({ ok: true, view: { state: "waiting", expiresAt: EXP } });
    expect(f.calls).toEqual([
      { fn: "start_approval_sign", args: { p_actor_id: HARU.userId, p_request_id: REQ, p_method: "fake" } },
      { fn: "record_approval_sign_tx", args: { p_actor_id: HARU.userId, p_sign_request_id: SIGN, p_tx_id: "tx_1" } },
    ]);
    expect(s.asked.requested).toEqual([{ requestId: SIGN, plaintext: PLAIN, requestMessage: "팬꾹 선물 수령 승인", envelope: ENV, creatorId: CREATOR }]);
    expect(APPROVAL_REQUEST_MESSAGE).toBe("팬꾹 선물 수령 승인");
  });

  it("INV-S17 S17b: 기다리는 요청이 있으면(DB 가 pending) 창구에 다시 보내지 않고 그 요청을 이어 보인다", async () => {
    const f = fakeAdmin({ start_approval_sign: startRow("pending", { sign_request_id: SIGN, plaintext: PLAIN, expires_at: EXP }) });
    const s = spySigner();
    expect(await startApprovalSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).toEqual({ ok: true, view: { state: "waiting", expiresAt: EXP } });
    expect(s.asked.requested).toEqual([]);
    expect(f.calls.map((c) => c.fn)).toEqual(["start_approval_sign"]);
  });

  it("INV-S17 (실패경로): 창구가 요청을 받지 못하면 그 요청을 끝내고 다시 요청할 수 있게 답한다", async () => {
    const f = fakeAdmin({ start_approval_sign: started, close_approval_sign: { data: "closed" } });
    const s = spySigner(undefined, { ok: false });
    const r = await startApprovalSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ });
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(f.calls[1]).toEqual({ fn: "close_approval_sign", args: { p_actor_id: HARU.userId, p_sign_request_id: SIGN, p_outcome: "failed" } });
  });

  it("INV-S17 S17c (실패경로): 하루 다섯 번을 넘으면 429 와 too_many — 화면은 「다시 요청」을 숨긴다", async () => {
    const f = fakeAdmin({ start_approval_sign: startRow("too_many_day") });
    expect(await startApprovalSign({ admin: f.admin, viewer: HARU, signer: spySigner().signer }, { requestId: REQ })).toMatchObject({ ok: false, status: 429, code: "too_many" });
  });

  it("INV-S13·S6·S16: 주소 없음은 no_address, 168시간 지남은 기한 문구, 연결 전·승인할 수 없는 주문·이미 승인은 409", async () => {
    const cases: [string, Record<string, unknown>][] = [
      ["no_address", { status: 409, code: "no_address" }],
      ["expired", { status: 409, message: APPROVAL_EXPIRED_MESSAGE }],
      ["not_linked", { status: 409 }],
      ["not_approvable", { status: 409 }],
      ["already", { status: 409 }],
      ["not_found", { status: 404 }],
      ["method_refused", { status: 503 }],
    ];
    for (const [result, expected] of cases) {
      const f = fakeAdmin({ start_approval_sign: startRow(result) });
      expect(await startApprovalSign({ admin: f.admin, viewer: HARU, signer: spySigner().signer }, { requestId: REQ }), result).toMatchObject({ ok: false, ...expected });
    }
  });

  it("INV-S11 S11b·S11c (실패경로): 로그인 안 함·팬·창구 없음·꼴이 틀린 요청 ID 는 DB 를 부르지 않고 거부", async () => {
    for (const [viewer, signer, body, status] of [
      [null, spySigner().signer, { requestId: REQ }, 401],
      [FAN, spySigner().signer, { requestId: REQ }, 403],
      [HARU, null, { requestId: REQ }, 503],
      [HARU, spySigner().signer, { requestId: "apr_; drop" }, 400],
      [HARU, spySigner().signer, null, 400],
    ] as const) {
      const f = fakeAdmin({ start_approval_sign: started });
      expect(await startApprovalSign({ admin: f.admin, viewer, signer }, body)).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-S1 (실패경로): DB 가 돌려준 원문이 네 값 꼴이 아니면 창구에 보내지 않는다", async () => {
    const f = fakeAdmin({ start_approval_sign: startRow("started", { sign_request_id: SIGN, plaintext: `${PLAIN}\n주소: 서울`, expires_at: EXP, envelope: ENV, creator_id: CREATOR }) });
    const s = spySigner();
    await expect(startApprovalSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).rejects.toThrow();
    expect(s.asked.requested).toEqual([]);
  });

  it("INV-S4 (실패경로): DB 가 새 요청의 크리에이터 ID 를 주지 않으면 창구에 보내지 않는다 — 게이트웨이가 봉투와 대조할 값이 없다", async () => {
    const f = fakeAdmin({ start_approval_sign: startRow("started", { sign_request_id: SIGN, plaintext: PLAIN, expires_at: EXP, envelope: ENV }) });
    const s = spySigner();
    await expect(startApprovalSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).rejects.toThrow();
    expect(s.asked.requested).toEqual([]);
  });
});

describe("INV-S17·S2·S12: 결과 확인 — signed 면 그 자리에서 승인", () => {
  it("INV-S17 S17: 창구가 서명됐다고 답하면 서명된 원문·서명값·서명 시각·방식을 승인 함수에 넘기고 「승인됨」", async () => {
    const f = fakeAdmin({ approval_sign_current: pendingNow, settle_approval_sign: { data: "approved" } });
    const s = spySigner(SIGNED);
    expect(await checkApprovalSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).toEqual({ ok: true, view: { state: "approved" } });
    expect(s.asked.results).toEqual([{ requestId: SIGN, txId: "tx_1", plaintext: PLAIN }]);
    expect(f.calls[1]).toEqual({
      fn: "settle_approval_sign",
      args: { p_actor_id: HARU.userId, p_sign_request_id: SIGN, p_signed_plaintext: PLAIN, p_signature: "sig", p_signed_at: SIGNED.state === "signed" ? SIGNED.signedAt : "", p_method: "fake" },
    });
  });

  it("INV-S2 S2 (실패경로): 서명된 원문이 저장 원문과 한 글자라도 다르면 승인 함수를 부르지 않고 요청을 끝낸다", async () => {
    const f = fakeAdmin({ approval_sign_current: pendingNow, close_approval_sign: { data: "closed" } });
    const s = spySigner({ ...SIGNED, signedPlaintext: `${PLAIN} ` } as SignatureResult);
    expect(await checkApprovalSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).toEqual({ ok: true, view: { state: "ended", reason: "failed" } });
    expect(f.calls.map((c) => c.fn)).toEqual(["approval_sign_current", "close_approval_sign"]);
  });

  it("INV-S11 (실패경로): 창구 방식과 다른 방식의 서명은 받지 않는다", async () => {
    const f = fakeAdmin({ approval_sign_current: pendingNow, close_approval_sign: { data: "closed" } });
    const s = spySigner({ ...SIGNED, method: "kakao" } as SignatureResult);
    expect((await checkApprovalSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ }))).toEqual({ ok: true, view: { state: "ended", reason: "failed" } });
    expect(f.calls.map((c) => c.fn)).not.toContain("settle_approval_sign");
  });

  it("INV-S17: 기다림·연결 실패는 「기다림」 그대로, 거부·불일치는 실패, 기한 지남은 시간 지남 — 앞의 둘은 요청을 끝내지 않는다", async () => {
    const cases: [SignatureResult, unknown, string | null][] = [
      [{ state: "pending" }, { state: "waiting", expiresAt: EXP }, null],
      [{ state: "unavailable" }, { state: "waiting", expiresAt: EXP }, null],
      [{ state: "rejected" }, { state: "ended", reason: "failed" }, "failed"],
      [{ state: "mismatch" }, { state: "ended", reason: "failed" }, "failed"],
      [{ state: "expired" }, { state: "ended", reason: "expired" }, "expired"],
    ];
    for (const [result, view, closed] of cases) {
      const f = fakeAdmin({ approval_sign_current: structuredClone(pendingNow), close_approval_sign: { data: "closed" } });
      expect(await checkApprovalSign({ admin: f.admin, viewer: HARU, signer: spySigner(result).signer }, { requestId: REQ }), result.state).toEqual({ ok: true, view });
      expect(f.calls.find((c) => c.fn === "close_approval_sign")?.args.p_outcome ?? null).toBe(closed);
    }
  });

  it("INV-S17 S17c (실패경로): DB 가 기한 지난 요청이라 답하면 창구에 묻지 않고 「다시 요청」, 승인 함수가 sign_expired 면 같은 답", async () => {
    const f1 = fakeAdmin({ approval_sign_current: currentRow("found", { sign_request_id: SIGN, state: "expired", expires_at: EXP }) });
    const s1 = spySigner(SIGNED);
    expect(await checkApprovalSign({ admin: f1.admin, viewer: HARU, signer: s1.signer }, { requestId: REQ })).toEqual({ ok: true, view: { state: "ended", reason: "expired" } });
    expect(s1.asked.results).toEqual([]);
    const f2 = fakeAdmin({ approval_sign_current: pendingNow, settle_approval_sign: { data: "sign_expired" } });
    expect(await checkApprovalSign({ admin: f2.admin, viewer: HARU, signer: spySigner(SIGNED).signer }, { requestId: REQ })).toEqual({ ok: true, view: { state: "ended", reason: "expired" } });
  });

  it("INV-S17 S17d (실패경로): 화면이 「서명됨」·서명 값을 꾸며 보내도 읽지 않는다 — 창구가 기다림이면 기다림", async () => {
    const f = fakeAdmin({ approval_sign_current: pendingNow });
    const body = { requestId: REQ, state: "signed", signedPlaintext: PLAIN, signature: "forged", method: "fake" };
    expect(await checkApprovalSign({ admin: f.admin, viewer: HARU, signer: spySigner().signer }, body)).toEqual({ ok: true, view: { state: "waiting", expiresAt: EXP } });
    expect(f.calls.map((c) => c.fn)).toEqual(["approval_sign_current"]);
  });

  it("INV-S17 S17d (실패경로): 다른 크리에이터의 요청은 DB 가 not_found — 없는 요청과 같은 404", async () => {
    const f = fakeAdmin({ approval_sign_current: currentRow("not_found") });
    const r = await checkApprovalSign({ admin: f.admin, viewer: HARU, signer: spySigner(SIGNED).signer }, { requestId: REQ });
    const missing = await checkApprovalSign({ admin: fakeAdmin({ approval_sign_current: currentRow("not_found") }).admin, viewer: HARU, signer: spySigner().signer }, { requestId: "apr_NOSUCH" });
    expect(r).toEqual(missing);
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("INV-S17: 서명 요청이 아직 없으면 none, 이미 승인이면 approved — 창구에 묻지 않는다", async () => {
    for (const [row, view] of [
      [currentRow("none"), { state: "none" }],
      [currentRow("approved"), { state: "approved" }],
    ] as const) {
      const s = spySigner(SIGNED);
      expect(await checkApprovalSign({ admin: fakeAdmin({ approval_sign_current: row }).admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).toEqual({ ok: true, view });
      expect(s.asked.results).toEqual([]);
    }
  });

  it("INV-S17: 거래 ID 가 아직 없으면(요청을 보내는 중) 창구에 묻지 않고 기다림", async () => {
    const f = fakeAdmin({ approval_sign_current: currentRow("found", { sign_request_id: SIGN, state: "pending", plaintext: PLAIN, gateway_tx_id: null, method: "fake", expires_at: EXP }) });
    const s = spySigner(SIGNED);
    expect(await checkApprovalSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).toEqual({ ok: true, view: { state: "waiting", expiresAt: EXP } });
    expect(s.asked.results).toEqual([]);
  });

  it("INV-S13: 승인 함수가 주소 없음이면 no_address(화면은 주소 단계로), 168시간 지남이면 기한 문구", async () => {
    const f1 = fakeAdmin({ approval_sign_current: pendingNow, settle_approval_sign: { data: "no_address" } });
    expect(await checkApprovalSign({ admin: f1.admin, viewer: HARU, signer: spySigner(SIGNED).signer }, { requestId: REQ })).toMatchObject({ ok: false, status: 409, code: "no_address" });
    const f2 = fakeAdmin({ approval_sign_current: structuredClone(pendingNow), settle_approval_sign: { data: "expired" } });
    expect(await checkApprovalSign({ admin: f2.admin, viewer: HARU, signer: spySigner(SIGNED).signer }, { requestId: REQ })).toMatchObject({ ok: false, status: 409, message: APPROVAL_EXPIRED_MESSAGE });
  });

  it("INV-S5: 승인 함수가 already 면(같은 서명이 두 번) 「승인됨」 — 두 번째도 처음 결과", async () => {
    const f = fakeAdmin({ approval_sign_current: pendingNow, settle_approval_sign: { data: "already" } });
    expect(await checkApprovalSign({ admin: f.admin, viewer: HARU, signer: spySigner(SIGNED).signer }, { requestId: REQ })).toEqual({ ok: true, view: { state: "approved" } });
  });

  it("승인 함수가 모르는 결과를 주면 던진다 — 모르는 결과를 성공으로 치지 않는다", async () => {
    const f = fakeAdmin({ approval_sign_current: pendingNow, settle_approval_sign: { data: "approved_maybe" } });
    await expect(checkApprovalSign({ admin: f.admin, viewer: HARU, signer: spySigner(SIGNED).signer }, { requestId: REQ })).rejects.toThrow();
  });
});
