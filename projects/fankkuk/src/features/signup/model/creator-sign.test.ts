import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ApprovalSigner, SignatureResult, SignRequestStart } from "@/shared/api/approval-signer/signer";
import { phoneHash, readPhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { checkCreatorSign, CREATOR_SIGN_MIN_AGE, startCreatorSign, type CreatorSignDeps } from "./creator-sign";
import { LINK_REQUEST_MESSAGE } from "@/entities/creator/model/signature-link-request";

// 가입 3단계 카카오 서명(signup INV-U19·U20) — 앱 서버의 판정. DB 함수의 판정(한도·잠금·한 처리)은 통합 시험(tests/integration/signup-kakao-sign-db)이 본다.
// 여기서 보는 것: 무엇을 믿는가(봉투·요청 ID 만), 창구 장애를 언제 적는가(두 번 실패만), 서명 결과를 언제 「확인됨」으로 넘기는가.

const KEY_ENV = { FANKKUK_PHONE_ENC_KEY: randomBytes(32).toString("base64"), FANKKUK_PHONE_HASH_KEY: randomBytes(32).toString("base64") };
const KEYS = readPhoneKeys(KEY_ENV);
const ENVELOPE = { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: "A".repeat(344), iv: "c2VlZC1zaWctbG5r", ciphertext: "B".repeat(24) };
const CREATOR_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const REQ = "11111111-2222-4333-8444-555555555555";
const TICKET = "22222222-3333-4444-8555-666666666666";
const PREV = "33333333-4444-4555-8666-777777777777";
const PAYLOAD = `fankkuk-signature-link:v1|req=${REQ}|at=2026-11-10T01:00:00.000Z`;
const IP = "f".repeat(64);
const startBody = (extra: Record<string, unknown> = {}) => ({ identity: ENVELOPE, creatorId: CREATOR_ID, phone: "010-1234-5678", ...extra });

type Call = { fn: string; args: Record<string, unknown> };
type RpcReply = { data: unknown; error: { code?: string } | null };

function harness(opts: {
  signer?: ApprovalSigner | null;
  starts?: SignRequestStart[];
  results?: SignatureResult[];
  rpc?: Record<string, RpcReply | ((args: Record<string, unknown>) => RpcReply)>;
} = {}) {
  const calls: Call[] = [];
  const signerCalls: { kind: "request" | "result"; input: Record<string, unknown> }[] = [];
  const starts = [...(opts.starts ?? [{ ok: true, txId: `tx-${REQ}` }])];
  const results = [...(opts.results ?? [{ state: "signed", method: "fake", signedPlaintext: PAYLOAD, signature: "s", signedAt: "2026-11-10T01:01:00Z" }])];
  const signer: ApprovalSigner = {
    kind: "fake",
    async requestSignature(input) {
      signerCalls.push({ kind: "request", input });
      return starts.shift() ?? { ok: false, down: true };
    },
    async signatureResult(input) {
      signerCalls.push({ kind: "result", input });
      return results.shift() ?? { state: "unavailable" };
    },
  };
  const defaults: Record<string, RpcReply> = {
    start_signup_sign: { data: [{ result: "started", request_id: REQ, payload: PAYLOAD, expires_at: "2026-11-10T01:05:00Z" }], error: null },
    record_signup_sign_tx: { data: "recorded", error: null },
    close_signup_sign: { data: "closed", error: null },
    signup_sign_request: { data: [{ state: "pending", payload: PAYLOAD, gateway_tx_id: `tx-${REQ}` }], error: null },
    settle_signup_sign: { data: [{ result: "verified" }], error: null },
  };
  const deps: CreatorSignDeps = {
    admin: {
      async rpc(fn, args) {
        calls.push({ fn, args });
        const r = opts.rpc?.[fn] ?? defaults[fn];
        if (!r) throw new Error(`모르는 함수 ${fn}`);
        return typeof r === "function" ? r(args) : r;
      },
    },
    signer: opts.signer === undefined ? signer : opts.signer,
    phoneKeys: () => KEYS,
    newTicket: () => TICKET,
  };
  return { deps, calls, signerCalls };
}

describe("INV-U19: 서명 요청 만들기", () => {
  it("INV-U19 ①④: 봉투·크리에이터 ID·번호로 요청을 만들고 창구에 지정 번호·만 14세와 함께 보낸다 — 번호표는 새로 발급, 번호는 해시로만 DB 에", async () => {
    const h = harness();
    const r = await startCreatorSign(h.deps, startBody(), IP, PREV);
    expect(r).toEqual({ ok: true, state: "pending", ticket: TICKET, requestId: REQ, expiresAt: "2026-11-10T01:05:00Z" });
    const start = h.calls.find((c) => c.fn === "start_signup_sign")!;
    expect(start.args).toEqual({
      p_ticket: TICKET,
      p_prev_ticket: PREV,
      p_creator_id: CREATOR_ID,
      p_phone_hash: phoneHash(KEYS, "01012345678"),
      p_ip_hash: IP,
      p_envelope: ENVELOPE,
      p_method: "fake",
    });
    expect(JSON.stringify(start.args)).not.toContain("01012345678");
    expect(h.signerCalls[0]!.input).toEqual({
      requestId: REQ,
      plaintext: PAYLOAD,
      requestMessage: LINK_REQUEST_MESSAGE,
      envelope: ENVELOPE,
      creatorId: CREATOR_ID,
      phone: "01012345678",
      minAge: CREATOR_SIGN_MIN_AGE,
    });
    expect(CREATOR_SIGN_MIN_AGE).toBe(14);
    expect(h.calls.find((c) => c.fn === "record_signup_sign_tx")?.args).toEqual({ p_ticket: TICKET, p_request_id: REQ, p_tx_id: `tx-${REQ}` });
  });

  it("INV-U19 ⑤ (실패경로): 봉인되지 않은 정보·평문 이름·잘못된 크리에이터 ID·번호 꼴이면 DB 를 부르지 않고 거부", async () => {
    for (const body of [
      startBody({ identity: { name: "김하루", birth: "19980315" } }),
      startBody({ identity: null }),
      startBody({ creatorId: "not-a-uuid" }),
      startBody({ phone: "02-123-4567" }),
    ]) {
      const h = harness();
      const r = await startCreatorSign(h.deps, body, IP, null);
      expect(r.ok, JSON.stringify(body)).toBe(false);
      expect(h.calls).toEqual([]);
      expect(h.signerCalls).toEqual([]);
    }
  });

  it("INV-U19 · INV-U9 (실패경로): 창구가 없으면(운영, 설정 없음) 요청을 만들지 않는다 — 장애가 아니다", async () => {
    const h = harness({ signer: null });
    const r = await startCreatorSign(h.deps, startBody(), IP, null);
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(h.calls).toEqual([]);
  });

  it("INV-U19 ④ (S19g, 실패경로): 한도에 걸리면 창구에 보내지 않는다(1시간·하루 문구가 다르다)", async () => {
    for (const result of ["too_many", "too_many_day"]) {
      const h = harness({ rpc: { start_signup_sign: { data: [{ result, request_id: null, payload: null, expires_at: null }], error: null } } });
      const r = await startCreatorSign(h.deps, startBody(), IP, null);
      expect(r).toMatchObject({ ok: false, status: 429 });
      expect(h.signerCalls).toEqual([]);
    }
  });

  it("INV-U19 (실패경로): DB 에 가입 서명 함수가 없으면(개인정보 구역 SQL 적용 전) 「이용할 수 없음」 — 장애로 적지 않는다", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const h = harness({ rpc: { start_signup_sign: { data: null, error: { code } } } });
      const r = await startCreatorSign(h.deps, startBody(), IP, null);
      expect(r).toMatchObject({ ok: false, status: 503 });
      expect(h.calls.map((c) => c.fn)).toEqual(["start_signup_sign"]);
    }
  });
});

describe("INV-U20: 창구 장애 판정 — 요청 만들기", () => {
  it("INV-U20 (S20): 창구 요청이 두 번 장애로 실패하면 그 번호표에 「창구 장애 확인」을 적고 6자리 길로 답한다", async () => {
    const h = harness({ starts: [{ ok: false, down: true }, { ok: false, down: true }] });
    const r = await startCreatorSign(h.deps, startBody(), IP, null);
    expect(r).toEqual({ ok: true, state: "down", ticket: TICKET });
    expect(h.signerCalls.filter((c) => c.kind === "request")).toHaveLength(2);
    expect(h.calls.find((c) => c.fn === "close_signup_sign")?.args).toEqual({ p_ticket: TICKET, p_request_id: REQ, p_outcome: "down" });
  });

  it("INV-U20 (실패경로): 한 번 실패하고 다시 부른 요청이 되면 장애가 아니다 — 기다리는 중", async () => {
    const h = harness({ starts: [{ ok: false, down: true }, { ok: true, txId: "tx-2" }] });
    const r = await startCreatorSign(h.deps, startBody(), IP, null);
    expect(r).toMatchObject({ ok: true, state: "pending" });
    expect(h.calls.some((c) => c.fn === "close_signup_sign")).toBe(false);
  });

  it("INV-U20 (S20c, 실패경로): 창구가 요청을 받지 않으면(4xx — 봉투·번호 불일치) 장애가 아니다 — 실패로 닫고 다시 적게 한다", async () => {
    const h = harness({ starts: [{ ok: false, down: false }] });
    const r = await startCreatorSign(h.deps, startBody(), IP, null);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(h.signerCalls.filter((c) => c.kind === "request")).toHaveLength(1);
    expect(h.calls.find((c) => c.fn === "close_signup_sign")?.args).toEqual({ p_ticket: TICKET, p_request_id: REQ, p_outcome: "failed" });
  });
});

describe("INV-U19: 서명 결과 확인", () => {
  it("INV-U19 ① (S19): 서버가 창구에 직접 묻고, 서명된 원문이 저장 원문과 같으면 「서명됨」으로 넘긴다 — 확인 줄은 DB 가 적는다", async () => {
    const h = harness();
    const r = await checkCreatorSign(h.deps, { requestId: REQ }, TICKET);
    expect(r).toEqual({ ok: true, state: "verified" });
    expect(h.signerCalls[0]!.input).toEqual({ requestId: REQ, txId: `tx-${REQ}`, plaintext: PAYLOAD });
    expect(h.calls.find((c) => c.fn === "settle_signup_sign")?.args).toEqual({
      p_ticket: TICKET,
      p_request_id: REQ,
      p_outcome: "signed",
      p_signed_content: PAYLOAD,
      p_method: "fake",
    });
  });

  it("INV-U19 (S19b, 실패경로): 서명된 원문이 다르거나 방식이 다르거나 대상자 불일치면 실패로 닫는다", async () => {
    const cases: SignatureResult[] = [
      { state: "signed", method: "fake", signedPlaintext: `${PAYLOAD}x`, signature: "s", signedAt: "2026-11-10T01:01:00Z" },
      { state: "signed", method: "kakao", signedPlaintext: PAYLOAD, signature: "s", signedAt: "2026-11-10T01:01:00Z" },
      { state: "mismatch" },
    ];
    for (const res of cases) {
      const h = harness({ results: [res], rpc: { settle_signup_sign: { data: [{ result: "failed" }], error: null } } });
      const r = await checkCreatorSign(h.deps, { requestId: REQ }, TICKET);
      expect(r, JSON.stringify(res)).toEqual({ ok: true, state: "failed" });
      expect(h.calls.find((c) => c.fn === "settle_signup_sign")?.args).toMatchObject({ p_outcome: "failed", p_signed_content: null });
    }
  });

  it("INV-U20 (S20c, 실패경로): 서명 거절·기한 지남은 장애가 아니다 — 실패로 닫고 「창구 장애 확인」을 적지 않는다", async () => {
    for (const res of [{ state: "rejected" }, { state: "expired" }] as SignatureResult[]) {
      const h = harness({ results: [res], rpc: { settle_signup_sign: { data: [{ result: "failed" }], error: null } } });
      expect(await checkCreatorSign(h.deps, { requestId: REQ }, TICKET)).toEqual({ ok: true, state: "failed" });
      expect(h.calls.find((c) => c.fn === "close_signup_sign")).toBeUndefined();
    }
  });

  it("INV-U20 정함: 결과 조회가 두 번 연달아 실패하면(창구 장애) 그 번호표에 「창구 장애 확인」 — 한 번이면 기다림 그대로", async () => {
    const twice = harness({ results: [{ state: "unavailable" }, { state: "unavailable" }] });
    expect(await checkCreatorSign(twice.deps, { requestId: REQ }, TICKET)).toEqual({ ok: true, state: "down" });
    expect(twice.calls.find((c) => c.fn === "close_signup_sign")?.args).toEqual({ p_ticket: TICKET, p_request_id: REQ, p_outcome: "down" });

    const once = harness({ results: [{ state: "unavailable" }, { state: "pending" }] });
    expect(await checkCreatorSign(once.deps, { requestId: REQ }, TICKET)).toEqual({ ok: true, state: "pending" });
    expect(once.calls.find((c) => c.fn === "close_signup_sign")).toBeUndefined();
  });

  it("INV-U3·U11 (S19d): 검증된 서명의 번호가 이미 가입된 번호면 DB 의 답 그대로 「이미 가입된 번호」", async () => {
    const h = harness({ rpc: { settle_signup_sign: { data: [{ result: "exists" }], error: null } } });
    expect(await checkCreatorSign(h.deps, { requestId: REQ }, TICKET)).toEqual({ ok: true, state: "exists" });
  });

  it("INV-U1 (S19b, 실패경로): 본문의 「서명 완료」·서명 값은 읽지 않는다 — 번호표 없이 묻거나 남의 요청이면 없는 요청", async () => {
    const forged = harness({ results: [{ state: "pending" }] });
    expect(await checkCreatorSign(forged.deps, { requestId: REQ, state: "verified", signed: true, signedPlaintext: PAYLOAD }, TICKET)).toEqual({ ok: true, state: "pending" });
    expect(forged.calls.some((c) => c.fn === "settle_signup_sign")).toBe(false);

    const noTicket = harness();
    expect(await checkCreatorSign(noTicket.deps, { requestId: REQ }, null)).toMatchObject({ ok: false, status: 404 });
    expect(noTicket.calls).toEqual([]);

    const other = harness({ rpc: { signup_sign_request: { data: [{ state: "not_found", payload: null, gateway_tx_id: null }], error: null } } });
    expect(await checkCreatorSign(other.deps, { requestId: REQ }, TICKET)).toMatchObject({ ok: false, status: 404 });
    expect(other.signerCalls).toEqual([]);
  });

  it("INV-U19: 이미 끝난 요청은 창구에 다시 묻지 않고 DB 의 상태를 그대로 답한다", async () => {
    for (const state of ["verified", "failed", "exists", "down"] as const) {
      const h = harness({ rpc: { signup_sign_request: { data: [{ state, payload: null, gateway_tx_id: null }], error: null } } });
      expect(await checkCreatorSign(h.deps, { requestId: REQ }, TICKET)).toEqual({ ok: true, state });
      expect(h.signerCalls).toEqual([]);
    }
    const expired = harness({ rpc: { signup_sign_request: { data: [{ state: "expired", payload: null, gateway_tx_id: null }], error: null } } });
    expect(await checkCreatorSign(expired.deps, { requestId: REQ }, TICKET)).toEqual({ ok: true, state: "failed" });
  });
});
