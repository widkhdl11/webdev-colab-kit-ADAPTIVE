import { describe, expect, it } from "vitest";
import { MESSAGE_CLAIM_LIMIT, MESSAGE_STORAGE_NOT_FOUND, storageRequest } from "./storage";

// 물품 보관소 (inbound-address-code INV-C13·C10). 몸통의 kind 로 셋을 가른다 — 목록 읽기 · 선물 선택 후보 읽기 · 「내 물품 확인」.
// 누구인지·후보인지·두 값이 맞는지는 DB 가 로그인 토큰으로 판정한다. 틀린 이유는 나누지 않는다(「물품을 찾을 수 없어요」 하나).

const FAN = { userId: "fan-byeolbit", role: "fan" } as const;
const CREATOR = { userId: "c-haru", role: "creator" } as const;
const OPERATOR = { userId: "op", role: "operator" } as const;
const ID = "11111111-1111-4111-8111-111111111111";
const BOX = "22222222-2222-4222-8222-222222222222";

type Reply = { data?: unknown; error: { code: string } | null };
function fakeClient(replies: Record<string, Reply>) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      const r = replies[fn] ?? { error: { code: "XX000" } };
      return { data: r.data ?? null, error: r.error };
    },
  } as never;
  return { client, calls };
}

const LIST_ROW = { id: ID, arrived_at: "2026-10-20T01:00:00+00:00", carrier: "cj", tier: "small", look: "하늘색 종이 상자, 리본", deadline_at: "2026-11-19T01:00:00+00:00", claim_pending: false };
const CANDIDATE = { box_id: BOX, label: "FC-7K3M9", item_kind: "향수", creator_name: "하루", paid_at: "2026-10-18T01:00:00+00:00", tier: "small" };

describe("INV-C13 물품 보관소 목록", () => {
  it("INV-C13 (S13): 정해진 칸만 옮긴다 — 도착일·택배사·크기·포장 모양·기한·내 확인 대기", async () => {
    const f = fakeClient({ storage_parcels: { data: [LIST_ROW], error: null } });
    expect(await storageRequest({ client: f.client, viewer: FAN }, { kind: "list" })).toEqual({
      status: 200,
      body: { parcels: [{ id: ID, arrivedAt: LIST_ROW.arrived_at, carrier: "cj", tier: "small", look: LIST_ROW.look, deadlineAt: LIST_ROW.deadline_at, claimPending: false }] },
    });
    expect(f.calls).toEqual([{ fn: "storage_parcels", args: undefined }]);
  });

  it("INV-C13 (실패경로): 정해진 칸 밖의 값(송장번호·선반·전화번호 뒤 4자리)이 오면 내보내지 않고 500", async () => {
    for (const extra of [{ waybill_no: "123456789012" }, { shelf: "A-1" }, { phone_last4: "5678" }]) {
      const f = fakeClient({ storage_parcels: { data: [{ ...LIST_ROW, ...extra }], error: null } });
      expect([extra, (await storageRequest({ client: f.client, viewer: FAN }, { kind: "list" })).status]).toEqual([extra, 500]);
    }
  });

  it("INV-C13 (실패경로): 로그인 안 함 401 · 운영자 403 — DB 를 부르지 않는다", async () => {
    const f = fakeClient({});
    expect((await storageRequest({ client: f.client, viewer: null }, { kind: "list" })).status).toBe(401);
    expect((await storageRequest({ client: f.client, viewer: OPERATOR }, { kind: "list" })).status).toBe(403);
    expect(f.calls).toEqual([]);
  });
});

describe("INV-C13 선물 선택 후보", () => {
  it("INV-C13: 본인 입고 전 상자 — 선물 이름·크리에이터·결제일·크기", async () => {
    const f = fakeClient({ storage_claim_candidates: { data: [CANDIDATE], error: null } });
    expect(await storageRequest({ client: f.client, viewer: CREATOR }, { kind: "candidates" })).toEqual({
      status: 200,
      body: { candidates: [{ boxId: BOX, label: "FC-7K3M9", itemKind: "향수", creatorName: "하루", paidAt: CANDIDATE.paid_at, tier: "small" }] },
    });
  });
});

describe("INV-C13 「내 물품 확인」", () => {
  const claim = (extra: Record<string, unknown> = {}) => ({ kind: "claim", id: ID, boxId: BOX, waybill: "1234-5678-9012", carrier: "cj", ...extra });

  it("INV-C13 (S13b): 상자·고른 선물·송장번호(숫자만)·택배사를 넘기고, 맞으면 확인 대기", async () => {
    const f = fakeClient({ claim_storage_parcel: { data: "pending", error: null } });
    expect(await storageRequest({ client: f.client, viewer: FAN }, claim())).toEqual({ status: 200, body: { result: "pending" } });
    expect(f.calls).toEqual([{ fn: "claim_storage_parcel", args: { p_id: ID, p_box_id: BOX, p_waybill: "123456789012", p_carrier: "cj" } }]);
  });

  it("INV-C13 (S13c, 실패경로): 틀린 두 값·후보 아닌 선물은 같은 「물품을 찾을 수 없어요」 — 이유를 나누지 않는다", async () => {
    for (const answer of ["not_found", "not_candidate"]) {
      const f = fakeClient({ claim_storage_parcel: { data: answer, error: null } });
      expect([answer, await storageRequest({ client: f.client, viewer: FAN }, claim())]).toEqual([
        answer,
        { status: 200, body: { result: "not_found", message: MESSAGE_STORAGE_NOT_FOUND } },
      ]);
    }
  });

  it("INV-C10 (실패경로): 그날 다섯 번 틀렸으면(P0045) 429 · 모르는 답은 500 · 꼴이 다른 송장번호·택배사·칸은 400(DB 를 부르지 않음)", async () => {
    expect(await storageRequest({ client: fakeClient({ claim_storage_parcel: { error: { code: "P0045" } } }).client, viewer: FAN }, claim())).toEqual({
      status: 429,
      body: { message: MESSAGE_CLAIM_LIMIT },
    });
    expect((await storageRequest({ client: fakeClient({ claim_storage_parcel: { data: "linked", error: null } }).client, viewer: FAN }, claim())).status).toBe(500);
    const f = fakeClient({});
    for (const bad of [{ waybill: "12" }, { carrier: "ups" }, { boxId: "x" }, { orderNo: "FC-1" }]) {
      expect([bad, (await storageRequest({ client: f.client, viewer: FAN }, claim(bad))).status]).toEqual([bad, 400]);
    }
    expect((await storageRequest({ client: f.client, viewer: FAN }, { kind: "nope" })).status).toBe(400);
    expect(f.calls).toEqual([]);
  });
});
