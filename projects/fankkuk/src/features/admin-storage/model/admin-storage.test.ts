import { describe, expect, it } from "vitest";
import {
  adminStorageRequest,
  MESSAGE_CLAIM_CLOSED,
  MESSAGE_CLAIM_NOT_CANDIDATE,
  MESSAGE_LOOK_LENGTH,
  MESSAGE_PHONE_SEARCH,
  MESSAGE_PHONE_SEARCH_UNAVAILABLE,
} from "./admin-storage";

// 운영자 물품 보관소 (inbound-address-code INV-C13·C12 ③·C5, office-workflow INV-W5·W7). 몸통의 kind 로 다섯을 가른다 —
// 확인 요청 목록(claims) · 입고 처리(accept) · 주인 아님(reject) · 포장 모양 수정(look) · 전화번호 뒤 4자리 검색(phone_search).
// 운영자가 아니면 404. 잠금 뒤 판정(대기인지·후보인지·기한)은 DB 가 한다.

const CLAIM = "33333333-3333-4333-8333-333333333333";
const ID = "11111111-1111-4111-8111-111111111111";

type Reply = { data?: unknown; error: { code: string } | null };
function fakeClient(replies: Record<string, Reply>, operator = true) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: operator, error: null };
      if (fn === "is_owner") return { data: false, error: null };
      calls.push({ fn, args });
      const r = replies[fn] ?? { error: { code: "XX000" } };
      return { data: r.data ?? null, error: r.error };
    },
  } as never;
  return { client, calls };
}

const CLAIM_ROW = {
  claim_id: CLAIM,
  unmatched_id: ID,
  requested_at: "2026-10-21T01:00:00+00:00",
  nickname: "별빛",
  waybill_no: "123456789012",
  carrier: "cj",
  order_no: "FC-7K3M9",
  box_label: "FC-7K3M9",
  tier: "small",
  shelf: "A-03",
  arrived_at: "2026-10-20T01:00:00+00:00",
  look: "하늘색 종이 상자, 리본",
};

describe("INV-C13 운영자 확인 요청", () => {
  it("INV-C13 (S13b): 확인 요청 목록 — 요청 시각·닉네임·입력한 송장번호·택배사·선택한 선물·보관 위치", async () => {
    const f = fakeClient({ admin_storage_claims: { data: [CLAIM_ROW], error: null } });
    const reply = await adminStorageRequest(f.client, { kind: "claims" });
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({
      claims: [
        {
          claimId: CLAIM,
          unmatchedId: ID,
          requestedAt: CLAIM_ROW.requested_at,
          nickname: "별빛",
          waybillNo: "123456789012",
          carrier: "cj",
          orderNo: "FC-7K3M9",
          boxLabel: "FC-7K3M9",
          tier: "small",
          shelf: "A-03",
          arrivedAt: CLAIM_ROW.arrived_at,
          look: CLAIM_ROW.look,
        },
      ],
    });
  });

  it("INV-C13 (S13b): 입고 처리는 「송장번호·내용물 확인함」 표시와 함께만 — 확인 요청 id 하나를 넘긴다", async () => {
    const f = fakeClient({ admin_accept_storage_claim: { data: "linked", error: null } });
    expect(await adminStorageRequest(f.client, { kind: "accept", claimId: CLAIM, checked: true })).toEqual({ status: 200, body: { ok: true } });
    expect(f.calls).toEqual([{ fn: "admin_accept_storage_claim", args: { p_claim_id: CLAIM, p_checked: true } }]);
    const g = fakeClient({});
    expect((await adminStorageRequest(g.client, { kind: "accept", claimId: CLAIM, checked: false })).status).toBe(400);
    expect((await adminStorageRequest(g.client, { kind: "accept", claimId: CLAIM })).status).toBe(400);
    expect(g.calls).toEqual([]);
  });

  it("INV-C13 (실패경로): 선택한 선물이 후보가 아님(P0047) · 이미 끝난 요청(55000) · 같은 송장번호 분쟁(P0048) · 모르는 답", async () => {
    const accept = { kind: "accept", claimId: CLAIM, checked: true };
    expect(await adminStorageRequest(fakeClient({ admin_accept_storage_claim: { error: { code: "P0047" } } }).client, accept)).toEqual({
      status: 409,
      body: { message: MESSAGE_CLAIM_NOT_CANDIDATE },
    });
    expect(await adminStorageRequest(fakeClient({ admin_accept_storage_claim: { error: { code: "55000" } } }).client, accept)).toEqual({
      status: 409,
      body: { message: MESSAGE_CLAIM_CLOSED },
    });
    expect((await adminStorageRequest(fakeClient({ admin_accept_storage_claim: { error: { code: "P0048" } } }).client, accept)).status).toBe(409);
    expect((await adminStorageRequest(fakeClient({ admin_accept_storage_claim: { data: "ok", error: null } }).client, accept)).status).toBe(500);
  });

  it("INV-C13 (S13b): 주인 아님 — 대기만 풀린다 · 이미 끝난 요청은 409", async () => {
    const f = fakeClient({ admin_reject_storage_claim: { data: null, error: null } });
    expect(await adminStorageRequest(f.client, { kind: "reject", claimId: CLAIM })).toEqual({ status: 200, body: { ok: true } });
    expect(f.calls).toEqual([{ fn: "admin_reject_storage_claim", args: { p_claim_id: CLAIM } }]);
    expect(await adminStorageRequest(fakeClient({ admin_reject_storage_claim: { error: { code: "55000" } } }).client, { kind: "reject", claimId: CLAIM })).toEqual({
      status: 409,
      body: { message: MESSAGE_CLAIM_CLOSED },
    });
  });

  it("INV-C13 (실패경로): 운영자가 아니면 404 — DB 쓰기 함수를 부르지 않는다", async () => {
    const f = fakeClient({}, false);
    for (const body of [{ kind: "claims" }, { kind: "accept", claimId: CLAIM, checked: true }, { kind: "reject", claimId: CLAIM }, { kind: "look", id: ID, look: "x" }, { kind: "phone_search", last4: "5678" }]) {
      expect([body.kind, (await adminStorageRequest(f.client, body)).status]).toEqual([body.kind, 404]);
    }
    expect(f.calls).toEqual([]);
  });
});

describe("INV-C13 포장 모양 수정", () => {
  it("INV-C13: 앞뒤 공백을 뗀 값을 넘긴다 · 40자를 넘으면 400(DB 를 부르지 않음) · 이미 이어진 상자(55000)는 409", async () => {
    const f = fakeClient({ admin_set_unmatched_look: { data: null, error: null } });
    expect(await adminStorageRequest(f.client, { kind: "look", id: ID, look: " 갈색 상자 " })).toEqual({ status: 200, body: { ok: true } });
    expect(f.calls).toEqual([{ fn: "admin_set_unmatched_look", args: { p_id: ID, p_look: "갈색 상자" } }]);
    const g = fakeClient({});
    expect(await adminStorageRequest(g.client, { kind: "look", id: ID, look: "가".repeat(41) })).toEqual({ status: 400, body: { message: MESSAGE_LOOK_LENGTH } });
    expect(g.calls).toEqual([]);
    expect((await adminStorageRequest(fakeClient({ admin_set_unmatched_look: { error: { code: "55000" } } }).client, { kind: "look", id: ID, look: "x" })).status).toBe(409);
  });
});

describe("INV-C12 ③ 전화번호 뒤 4자리 검색", () => {
  it("INV-C12 (S12c): 숫자 넷을 넘기고 운영자 보류 목록과 같은 칸을 돌려준다", async () => {
    const row = {
      id: ID,
      source: "unmatched",
      qr: null,
      waybill_no: "123456789012",
      carrier: "cj",
      arrived_at: "2026-10-20T01:00:00+00:00",
      nickname: null,
      shelf: "A-03",
      reason: "no_code",
      suspected_theft: false,
      state: "waiting",
      deadline_at: "2026-11-19T01:00:00+00:00",
      share_movable: false,
      look: "흰 비닐 봉투",
      tier: "small",
      phone_last4: "5678",
      auto_return_at: "2026-11-19T01:00:00+00:00",
      in_storage: true,
    };
    const f = fakeClient({ admin_unmatched_by_phone_last4: { data: [row], error: null } });
    const reply = await adminStorageRequest(f.client, { kind: "phone_search", last4: "5678" });
    expect(reply.status).toBe(200);
    expect((reply.body as { parcels: { id: string; phoneLast4: string }[] }).parcels).toMatchObject([{ id: ID, phoneLast4: "5678", look: "흰 비닐 봉투", inStorage: true }]);
    expect(f.calls).toEqual([{ fn: "admin_unmatched_by_phone_last4", args: { p_last4: "5678" } }]);
  });

  it("INV-C12 (S12c, 실패경로): 숫자 넷이 아니면 400(DB 를 부르지 않음) · 검색 함수가 아직 없는 DB(manual/0023 전)면 503", async () => {
    const f = fakeClient({});
    for (const bad of ["010-1234-5678", "56a8", "567", ""]) {
      expect([bad, await adminStorageRequest(f.client, { kind: "phone_search", last4: bad })]).toEqual([bad, { status: 400, body: { message: MESSAGE_PHONE_SEARCH } }]);
    }
    expect(f.calls).toEqual([]);
    expect(await adminStorageRequest(fakeClient({ admin_unmatched_by_phone_last4: { error: { code: "PGRST202" } } }).client, { kind: "phone_search", last4: "5678" })).toEqual({
      status: 503,
      body: { message: MESSAGE_PHONE_SEARCH_UNAVAILABLE },
    });
  });
});
