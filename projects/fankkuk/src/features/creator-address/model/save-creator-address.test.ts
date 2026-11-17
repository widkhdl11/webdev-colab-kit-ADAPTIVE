// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { chooseApprovalSigner, type ApprovalSigner, type SignatureResult } from "@/shared/api/approval-signer/signer";
import { sealEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";
import { ADDRESS_SIGN_REQUEST_MESSAGE, checkCreatorAddressSign, startCreatorAddressSign } from "./save-creator-address";

// 크리에이터 주소 등록·변경 — 요청(start) · 결과 확인(check) (address-protection INV-P13·P16·P20·P22).
// DB 는 함수 이름별로 답을 정해 두는 가짜다(검증 대상은 앱 서버 쪽 판단 — DB 쪽은 통합 시험 creator-address-sign-db 가 본다).
// 서명 창구는 진짜 가짜 창구(fake) 또는 결과를 정해 둔 창구다.

const HARU = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" } as const;
const CREATOR_ID = "00000000-0000-4000-b000-000000000001";
const REQ = "5f0b2c1e-8d7a-4c3b-9e2f-1a2b3c4d5e6f";
const EXPIRES = "2026-11-17T10:05:00.000Z";
const PAYLOAD = `팬꾹 배송지 변경\n요청 ID: ${REQ}\n요청 시각: 2026-11-17T10:00:00.000Z\n주소 별칭: 집`;
const fake = chooseApprovalSigner({ NODE_ENV: "test" });

let envelope: Envelope;
let linkEnvelope: Envelope;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"],
  );
  envelope = JSON.parse(JSON.stringify(await sealEnvelope("{\"address1\":\"서울시 강남구 테헤란로 123\"}", pair.publicKey))) as Envelope;
  linkEnvelope = JSON.parse(JSON.stringify(await sealEnvelope("{\"name\":\"하루\"}", pair.publicKey))) as Envelope;
});

type Reply = { data?: unknown; error?: { code: string } | null };

function fakeAdmin(replies: Record<string, Reply>) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    names: () => calls.map((c) => c.fn),
    admin: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        const r = replies[fn] ?? { data: null };
        return { data: r.data ?? null, error: r.error ?? null };
      },
    } as never,
  };
}

const startRow = (over: Record<string, unknown> = {}) => ({
  data: [{ result: "started", request_id: REQ, payload: PAYLOAD, expires_at: EXPIRES, envelope: linkEnvelope, creator_id: CREATOR_ID, ...over }],
});
const startReplies = (over: Record<string, unknown> = {}): Record<string, Reply> => ({
  start_creator_address_sign: startRow(over),
  record_creator_address_sign_tx: { data: "recorded" },
  close_creator_address_sign: { data: "closed" },
});
const body = (over: Record<string, unknown> = {}) => ({ address: envelope, label: "home", region: "none", ...over });

/** 결과를 정해 둔 창구 — 요청·결과 확인에 넘어온 값을 남긴다 */
function scriptedSigner(result: SignatureResult, start: { ok: true; txId: string } | { ok: false; down: boolean; retry: boolean } = { ok: true, txId: "tx-1" }) {
  const requests: Parameters<ApprovalSigner["requestSignature"]>[0][] = [];
  const asked: Parameters<ApprovalSigner["signatureResult"]>[0][] = [];
  const signer: ApprovalSigner = {
    kind: "fake",
    async requestSignature(input) {
      requests.push(input);
      return start;
    },
    async signatureResult(input) {
      asked.push(input);
      return result;
    },
  };
  return { signer, requests, asked };
}

describe("주소 저장 요청 (address-protection INV-P22 ①·③·④)", () => {
  it("INV-P22 ① S22: 저장하지 않고 요청 줄을 만든다 — 세션의 크리에이터·봉인 주소·이름표·구분·방식을 넘기고, 연결 봉투로 서명을 요청하고, 거래 ID 를 적는다", async () => {
    const f = fakeAdmin(startReplies());
    const s = scriptedSigner({ state: "pending" });
    const r = await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, body());
    expect(r).toEqual({ ok: true, state: "waiting", requestId: REQ, expiresAt: EXPIRES });
    expect(f.calls[0]).toEqual({
      fn: "start_creator_address_sign",
      args: { p_actor_id: HARU.userId, p_envelope: envelope, p_label: "home", p_region: "none", p_method: "fake", p_resend: false },
    });
    // 서명 대상은 DB 가 돌려준 연결 봉투 — 브라우저가 보낸 주소 봉투가 아니다. 원문은 DB 가 만든 것 그대로
    expect(s.requests).toEqual([{ requestId: REQ, plaintext: PAYLOAD, requestMessage: ADDRESS_SIGN_REQUEST_MESSAGE, envelope: linkEnvelope, creatorId: CREATOR_ID }]);
    expect(f.calls[1]).toEqual({ fn: "record_creator_address_sign_tx", args: { p_actor_id: HARU.userId, p_request_id: REQ, p_tx_id: "tx-1" } });
    // 요청 단계에서는 주소 칸을 쓰는 함수를 부르지 않는다
    expect(f.names()).not.toContain("settle_creator_address_sign");
    expect(f.names()).toHaveLength(2);
  });

  it("INV-P22 ① (실패경로): 응답에 주소 봉투·연결 봉투·원문이 없다", async () => {
    const f = fakeAdmin(startReplies());
    const r = await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: fake }, body());
    const text = JSON.stringify(r);
    expect(text).not.toContain(String(envelope.ciphertext));
    expect(text).not.toContain(String(linkEnvelope.ciphertext));
    expect(text).not.toContain("팬꾹 배송지");
  });

  it("INV-P13 S13c (실패경로): 본문에 다른 사람 값·방식을 붙여도 세션의 크리에이터·이 창구의 방식으로만 요청한다", async () => {
    const f = fakeAdmin(startReplies());
    await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: fake }, body({ actorId: "x", p_actor_id: "x", creatorId: CREATOR_ID, method: "kakao", p_method: "kakao" }));
    expect(f.calls[0]!.args).toMatchObject({ p_actor_id: HARU.userId, p_method: "fake" });
  });

  it("INV-P22 ③: 「다시 보내기」(resend: true)만 새 요청을 청한다 — 그 밖의 값은 false", async () => {
    for (const [resend, expected] of [[true, true], ["true", false], [1, false], [undefined, false]] as const) {
      const f = fakeAdmin(startReplies());
      await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: fake }, body({ resend }));
      expect((f.calls[0]!.args as { p_resend: boolean }).p_resend).toBe(expected);
    }
  });

  it("INV-P22 ③ S22b: 기다리는 요청이 있으면 그 요청을 이어 보인다 — 카카오톡을 다시 보내지 않는다", async () => {
    const f = fakeAdmin({ start_creator_address_sign: startRow({ result: "pending", envelope: null, creator_id: null }) });
    const s = scriptedSigner({ state: "pending" });
    expect(await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, body())).toEqual({ ok: true, state: "waiting", requestId: REQ, expiresAt: EXPIRES });
    expect(s.requests).toEqual([]);
    expect(f.names()).toEqual(["start_creator_address_sign"]);
  });

  it("INV-P22 ③ S22b (실패경로): 1시간 한도·하루 한도는 각각 다른 429 — 서명 요청을 보내지 않는다", async () => {
    const s = scriptedSigner({ state: "pending" });
    const hour = await startCreatorAddressSign({ admin: fakeAdmin({ start_creator_address_sign: startRow({ result: "too_many" }) }).admin, viewer: HARU, signer: s.signer }, body());
    const day = await startCreatorAddressSign({ admin: fakeAdmin({ start_creator_address_sign: startRow({ result: "too_many_day" }) }).admin, viewer: HARU, signer: s.signer }, body());
    expect(hour).toMatchObject({ ok: false, status: 429, code: "too_many" });
    expect(day).toMatchObject({ ok: false, status: 429, code: "too_many" });
    expect(hour.ok === false && day.ok === false && hour.message !== day.message).toBe(true);
    expect(hour.ok === false && hour.message).toContain("1시간");
    expect(day.ok === false && day.message).toContain("내일");
    expect(s.requests).toEqual([]);
  });

  it("INV-P22 ① S22d (실패경로): 승인 서명 연결이 없으면 요청 없이 「카카오톡 인증 알림 연결 먼저」 — 서명을 요청하지 않는다", async () => {
    const f = fakeAdmin({ start_creator_address_sign: startRow({ result: "not_linked", request_id: null, payload: null, expires_at: null, envelope: null, creator_id: null }) });
    const s = scriptedSigner({ state: "pending" });
    const r = await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, body());
    expect(r).toMatchObject({ ok: false, status: 409, code: "not_linked" });
    expect(r.ok === false && r.message).toContain("카카오톡 인증 알림");
    expect(s.requests).toEqual([]);
  });

  it("INV-P22 ④ S22c: 가입 서명 갈음이면 DB 가 바로 저장하고 「저장됨」— 기다림 없이, 서명을 요청하지 않는다", async () => {
    const f = fakeAdmin({ start_creator_address_sign: startRow({ result: "saved_signup", request_id: null, payload: null, expires_at: null, envelope: null, creator_id: null }) });
    const s = scriptedSigner({ state: "pending" });
    expect(await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, body())).toEqual({ ok: true, state: "saved" });
    expect(s.requests).toEqual([]);
    expect(f.names()).toEqual(["start_creator_address_sign"]);
  });

  it("INV-P22 (실패경로): 창구가 요청을 받지 못하면 그 요청을 끝내고(봉인 지움) 503 「보내지 못했습니다」", async () => {
    const f = fakeAdmin(startReplies());
    const s = scriptedSigner({ state: "pending" }, { ok: false, down: true, retry: true });
    const r = await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, body());
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(r.ok === false && r.message).toContain("보내지 못했습니다");
    expect(f.calls.at(-1)).toEqual({ fn: "close_creator_address_sign", args: { p_actor_id: HARU.userId, p_request_id: REQ } });
    expect(f.names()).not.toContain("record_creator_address_sign_tx");
  });

  it("INV-P22 (실패경로): 창구 호출이 예외를 던져도 그 요청을 끝내고(봉인 지움) 503 — 보내지 않은 요청이 기다림으로 남지 않는다", async () => {
    const f = fakeAdmin(startReplies());
    const throwing: ApprovalSigner = {
      kind: "fake",
      requestSignature: async () => {
        throw new Error("창구 오류");
      },
      signatureResult: async () => ({ state: "pending" }),
    };
    const r = await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: throwing }, body());
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(f.names()).toEqual(["start_creator_address_sign", "close_creator_address_sign"]);
  });

  it("INV-P22 (실패경로): 거래 ID 를 적지 못하면 그 요청을 끝내고 503", async () => {
    const f = fakeAdmin({ ...startReplies(), record_creator_address_sign_tx: { data: "not_pending" } });
    const r = await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: fake }, body());
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(f.names()).toEqual(["start_creator_address_sign", "record_creator_address_sign_tx", "close_creator_address_sign"]);
  });

  it("INV-P22 (실패경로): 새 요청인데 연결 봉투·크리에이터 ID 가 비었으면 보내지 않고 던진다", async () => {
    await expect(startCreatorAddressSign({ admin: fakeAdmin(startReplies({ envelope: null })).admin, viewer: HARU, signer: fake }, body())).rejects.toThrow();
    await expect(startCreatorAddressSign({ admin: fakeAdmin(startReplies({ creator_id: null })).admin, viewer: HARU, signer: fake }, body())).rejects.toThrow();
  });

  it("INV-P13 S13c (실패경로): 로그인 없음 401, 팬·운영자 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "f", role: "fan" }, 403],
      [{ userId: "o", role: "operator" }, 403],
    ] as const) {
      const f = fakeAdmin(startReplies());
      expect(await startCreatorAddressSign({ admin: f.admin, viewer, signer: fake }, body())).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-P22 ⑤ (실패경로): 서명 창구가 없으면(운영) 503 — DB 를 부르지 않는다. 운영 표시로 고른 창구도 같다", async () => {
    for (const signer of [null, chooseApprovalSigner({ NODE_ENV: "production" })]) {
      const f = fakeAdmin(startReplies());
      expect(await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer }, body())).toMatchObject({ ok: false, status: 503 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-P1·P13 S13b (실패경로): 평문 주소·봉인 형식이 아닌 값은 400 — DB 를 부르지 않는다", async () => {
    for (const b of [
      { address: "서울시 강남구 테헤란로 123", label: "home", region: "none" },
      { address: { ...envelope, ciphertext: "서울시 강남구" }, label: "home", region: "none" },
      { address: { ...envelope, extra: 1 }, label: "home", region: "none" },
      { envelope },
      envelope,
      {},
      null,
      "서울시 강남구 테헤란로 123",
    ]) {
      const f = fakeAdmin(startReplies());
      expect(await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: fake }, b)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-P16 S16b (실패경로): 이름표가 없거나 목록 밖이면 400 — DB 를 부르지 않는다", async () => {
    for (const label of [undefined, null, "", "서울 강남구 집", "HOME", "집"]) {
      const f = fakeAdmin(startReplies());
      expect(await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: fake }, body({ label }))).toMatchObject({ ok: false, status: 400, message: "주소 별칭을 선택해 주세요." });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-P20 S20: 구분(제주)을 넘긴다 — 본문의 우편번호 칸은 넘기지 않는다 · 목록 밖 구분은 400", async () => {
    const f = fakeAdmin(startReplies());
    await startCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: fake }, body({ region: "jeju", zipCode: "63309" }));
    expect(f.calls[0]!.args).toMatchObject({ p_region: "jeju" });
    expect(JSON.stringify(f.calls)).not.toContain("63309");
    for (const region of [undefined, null, "", "63309", "JEJU"]) {
      const g = fakeAdmin(startReplies());
      expect(await startCreatorAddressSign({ admin: g.admin, viewer: HARU, signer: fake }, body({ region }))).toMatchObject({ ok: false, status: 400 });
      expect(g.calls).toEqual([]);
    }
  });

  it("DB 결과를 문구로 — 크리에이터 아님 403, 방식 거부 503, 형식 오류 400, 모르는 결과·오류는 던진다", async () => {
    const run = (r: Reply) => startCreatorAddressSign({ admin: fakeAdmin({ start_creator_address_sign: r }).admin, viewer: HARU, signer: fake }, body());
    expect(await run(startRow({ result: "not_creator" }))).toMatchObject({ ok: false, status: 403 });
    expect(await run(startRow({ result: "method_refused" }))).toMatchObject({ ok: false, status: 503 });
    expect(await run({ error: { code: "22023" } })).toMatchObject({ ok: false, status: 400 });
    await expect(run(startRow({ result: "weird" }))).rejects.toThrow();
    await expect(run({ error: { code: "42501" } })).rejects.toThrow();
  });
});

const readRow = (over: Record<string, unknown> = {}): Reply => ({ data: [{ state: "pending", payload: PAYLOAD, method: "fake", gateway_tx_id: "tx-1", ...over }] });
const checkReplies = (read: Reply = readRow(), settle: string = "saved"): Record<string, Reply> => ({
  creator_address_sign_request: read,
  settle_creator_address_sign: { data: [{ result: settle }] },
});
const settleArgs = (f: ReturnType<typeof fakeAdmin>) => f.calls.find((c) => c.fn === "settle_creator_address_sign")?.args as Record<string, unknown> | undefined;

describe("주소 저장 결과 확인 (address-protection INV-P22 ②)", () => {
  it("INV-P22 ② S22: 창구가 서명을 검증하고 서명된 원문이 저장 원문과 같을 때만 signed 로 적는다 → 「저장됨」", async () => {
    const f = fakeAdmin(checkReplies());
    const r = await checkCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: fake }, { requestId: REQ });
    expect(r).toEqual({ ok: true, state: "saved" });
    expect(f.calls[0]).toEqual({ fn: "creator_address_sign_request", args: { p_actor_id: HARU.userId, p_request_id: REQ } });
    expect(settleArgs(f)).toEqual({ p_actor_id: HARU.userId, p_request_id: REQ, p_outcome: "signed", p_signed_content: PAYLOAD, p_method: "fake" });
  });

  it("INV-P22 ② S22a (실패경로): 서명된 원문이 저장 원문과 다르면 failed 로 끝낸다 — signed 로 넘기지 않는다", async () => {
    const f = fakeAdmin(checkReplies(readRow(), "failed"));
    const s = scriptedSigner({ state: "signed", method: "fake", signedPlaintext: `${PAYLOAD} `, signature: "x", signedAt: EXPIRES });
    expect(await checkCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).toEqual({ ok: true, state: "failed" });
    expect(settleArgs(f)).toMatchObject({ p_outcome: "failed", p_signed_content: null });
  });

  it("INV-P22 ② S22a (실패경로): 서명 방식이 이 창구의 방식과 다르면 failed", async () => {
    const f = fakeAdmin(checkReplies(readRow(), "failed"));
    const s = scriptedSigner({ state: "signed", method: "kakao", signedPlaintext: PAYLOAD, signature: "x", signedAt: EXPIRES });
    await checkCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ });
    expect(settleArgs(f)).toMatchObject({ p_outcome: "failed", p_signed_content: null });
  });

  it("INV-P22 ② S22a (실패경로): 서명 거절은 rejected · 창구가 기한 지남을 알리면 expired · 대상자·원문 불일치는 failed — 각각 다른 상태", async () => {
    for (const [res, outcome] of [
      [{ state: "rejected" }, "rejected"],
      [{ state: "expired" }, "expired"],
      [{ state: "mismatch" }, "failed"],
    ] as const) {
      const f = fakeAdmin(checkReplies(readRow(), outcome));
      const s = scriptedSigner(res);
      expect(await checkCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).toEqual({ ok: true, state: outcome });
      expect(settleArgs(f)).toMatchObject({ p_outcome: outcome, p_signed_content: null });
    }
  });

  it("INV-P22 ② S22a (실패경로): DB 가 이미 끝난(기한 지남·거절·실패) 요청이라고 하면 그 상태 그대로 — 창구에 묻지 않고 적지 않는다", async () => {
    for (const state of ["expired", "rejected", "failed", "saved"] as const) {
      const f = fakeAdmin(checkReplies(readRow({ state, payload: null, method: null, gateway_tx_id: null })));
      const s = scriptedSigner({ state: "pending" });
      expect(await checkCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).toEqual({ ok: true, state });
      expect(s.asked).toEqual([]);
      expect(f.names()).toEqual(["creator_address_sign_request"]);
    }
  });

  it("INV-P22 ②: 아직 서명 전이거나 창구가 잠깐 답하지 않으면 기다림 — 적지 않는다", async () => {
    for (const res of [{ state: "pending" }, { state: "unavailable" }] as const) {
      const f = fakeAdmin(checkReplies());
      expect(await checkCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: scriptedSigner(res).signer }, { requestId: REQ })).toEqual({ ok: true, state: "pending" });
      expect(f.names()).toEqual(["creator_address_sign_request"]);
    }
  });

  it("INV-P22 ②: 거래 ID 가 아직 없으면 창구에 묻지 않고 기다림", async () => {
    const f = fakeAdmin(checkReplies(readRow({ gateway_tx_id: null })));
    const s = scriptedSigner({ state: "signed", method: "fake", signedPlaintext: PAYLOAD, signature: "x", signedAt: EXPIRES });
    expect(await checkCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ })).toEqual({ ok: true, state: "pending" });
    expect(s.asked).toEqual([]);
  });

  it("INV-P22 ② (실패경로): 본문은 요청 ID 하나 — 「저장됨」·서명 값을 붙여 와도 읽지 않고, ID 꼴이 아니면 DB 를 부르지 않는다", async () => {
    const f = fakeAdmin(checkReplies(readRow(), "failed"));
    const s = scriptedSigner({ state: "rejected" });
    await checkCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: s.signer }, { requestId: REQ, state: "saved", signedPlaintext: PAYLOAD });
    expect(settleArgs(f)).toMatchObject({ p_outcome: "rejected", p_signed_content: null });
    for (const b of [{}, { requestId: "abc" }, null, REQ]) {
      const g = fakeAdmin(checkReplies());
      expect(await checkCreatorAddressSign({ admin: g.admin, viewer: HARU, signer: fake }, b)).toMatchObject({ ok: false, status: 404 });
      expect(g.calls).toEqual([]);
    }
  });

  it("INV-P13 (실패경로): 남의 요청·없는 요청은 404", async () => {
    const f = fakeAdmin(checkReplies(readRow({ state: "not_found", payload: null, method: null, gateway_tx_id: null })));
    expect(await checkCreatorAddressSign({ admin: f.admin, viewer: HARU, signer: fake }, { requestId: REQ })).toMatchObject({ ok: false, status: 404 });
  });

  it("INV-P13 (실패경로): 로그인 없음 401, 팬 403, 창구 없음 503 — DB 를 부르지 않는다", async () => {
    for (const [viewer, signer, status] of [
      [null, fake, 401],
      [{ userId: "f", role: "fan" }, fake, 403],
      [HARU, null, 503],
    ] as const) {
      const f = fakeAdmin(checkReplies());
      expect(await checkCreatorAddressSign({ admin: f.admin, viewer, signer }, { requestId: REQ })).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-P22 ②: 적는 함수가 「저장됨」이 아니면 저장됨이라 하지 않는다 — 방식 거부 503, 모르는 결과는 던진다", async () => {
    const run = (settle: string) => checkCreatorAddressSign({ admin: fakeAdmin(checkReplies(readRow(), settle)).admin, viewer: HARU, signer: fake }, { requestId: REQ });
    expect(await run("failed")).toEqual({ ok: true, state: "failed" });
    expect(await run("expired")).toEqual({ ok: true, state: "expired" });
    expect(await run("method_refused")).toMatchObject({ ok: false, status: 503 });
    expect(await run("not_found")).toMatchObject({ ok: false, status: 404 });
    await expect(run("weird")).rejects.toThrow();
  });
});
