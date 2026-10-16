import { describe, expect, it } from "vitest";
import { linkHeld, MESSAGE_LINK_CLOSED, MESSAGE_WAYBILL_DISPUTE, MESSAGE_NOT_CANDIDATE, MESSAGE_NO_NICKNAME, readLinkCandidates } from "./link-held";

// 운영자 잇기 (inbound-address-code INV-C12, 카드 d94). 6자리 없이 온 보류 상자의 주인이 문의하면, 운영자가 송장번호·내용물을 확인하고
// 문의한 계정(닉네임으로 고름)의 결제 완료·입고 전 상자에 잇는다. 최종 판정(운영자인지·후보인지·잠금 뒤 상태)은 DB 가 한다.

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";
const BOX = "4f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";
const LINK = { kind: "link", id: ID, nickname: " 별빛 ", boxId: BOX, checked: true } as const;

function fakeClient(reply: { data?: unknown; error: { code: string } | null }, operator = true) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: operator, error: null };
      if (fn === "is_owner") return { data: false, error: null };
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error };
    },
  } as never;
  return { calls, client };
}

describe("운영자 잇기 (INV-C12)", () => {
  it("INV-C12 (S12b): 보류 줄 id · 문의한 팬의 닉네임(앞뒤 공백 뗌) · 고른 상자 · 확인 표시를 DB 함수에 넘긴다", async () => {
    const { calls, client } = fakeClient({ data: "linked", error: null });
    expect(await linkHeld(client, LINK)).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_link_held_parcel", args: { p_id: ID, p_nickname: "별빛", p_box_id: BOX, p_checked: true } }]);
  });

  it("INV-C12 (S12b, 실패경로): 「송장번호·내용물 확인함」 표시가 없거나 거짓이면 DB 를 부르지 않고 400", async () => {
    for (const body of [{ ...LINK, checked: false }, { kind: "link", id: ID, nickname: "별빛", boxId: BOX }]) {
      const { calls, client } = fakeClient({ data: "linked", error: null });
      expect((await linkHeld(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-C12 (실패경로): 주문번호 칸·빈 닉네임·꼴 틀린 id 는 400 — 주문번호로 잇는 길은 없다(INV-C9)", async () => {
    for (const body of [null, { ...LINK, orderNo: "FC-7K3M9" }, { ...LINK, nickname: "  " }, { ...LINK, nickname: "가".repeat(21) }, { ...LINK, boxId: "x" }, { ...LINK, id: "x" }]) {
      const { calls, client } = fakeClient({ data: "linked", error: null });
      expect((await linkHeld(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-C12: 닉네임은 DB 닉네임 칸과 같은 1~20자 — 13~20자 크리에이터 이름도 넘긴다", async () => {
    for (const n of ["가".repeat(13), "가".repeat(20)]) {
      const { calls, client } = fakeClient({ data: "linked", error: null });
      expect((await linkHeld(client, { ...LINK, nickname: n })).status).toBe(200);
      expect(calls).toHaveLength(1);
    }
    const { client } = fakeClient({ data: [], error: null });
    expect((await readLinkCandidates(client, { kind: "candidates", id: ID, nickname: "가".repeat(15) })).status).toBe(200);
  });

  it("INV-C12 · INV-C7 (실패경로): 같은 송장번호가 다른 상자에 등록된 분쟁(P0048)은 409 와 그 문구", async () => {
    expect(await linkHeld(fakeClient({ error: { code: "P0048" } }).client, LINK)).toEqual({ status: 409, body: { message: MESSAGE_WAYBILL_DISPUTE } });
  });

  it("INV-C12 (S12b, 실패경로): 운영자가 아니면 404 — 쓰기 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({ data: "linked", error: null }, false);
    expect((await linkHeld(client, LINK)).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("INV-C12 (실패경로): 후보 아님(P0047)·이미 이어짐/반송 대상/기한 지남(55000)은 409 문구가 다르고, 없는 닉네임(P0002)은 404, 권한(42501)은 403", async () => {
    expect(await linkHeld(fakeClient({ error: { code: "P0047" } }).client, LINK)).toEqual({ status: 409, body: { message: MESSAGE_NOT_CANDIDATE } });
    expect(await linkHeld(fakeClient({ error: { code: "55000" } }).client, LINK)).toEqual({ status: 409, body: { message: MESSAGE_LINK_CLOSED } });
    expect(await linkHeld(fakeClient({ error: { code: "P0002" } }).client, LINK)).toEqual({ status: 404, body: { message: MESSAGE_NO_NICKNAME } });
    expect((await linkHeld(fakeClient({ error: { code: "42501" } }).client, LINK)).status).toBe(403);
  });

  it("INV-C12 (실패경로): DB 가 모르는 답을 주면 이었다고 단정하지 않는다 — 500", async () => {
    expect((await linkHeld(fakeClient({ data: "maybe", error: null }).client, LINK)).status).toBe(500);
  });
});

describe("잇기 후보 읽기 (INV-C12)", () => {
  const ROW = { box_id: BOX, label: "FC-7K3M9-1", tier: "small", paid_at: "2026-10-10T01:00:00+00:00" };

  it("INV-C12: 닉네임으로 그 계정의 결제 완료·입고 전 상자를 읽어 화면 꼴로 돌려준다", async () => {
    const { calls, client } = fakeClient({ data: [ROW], error: null });
    expect(await readLinkCandidates(client, { kind: "candidates", id: ID, nickname: " 별빛 " })).toEqual({
      status: 200,
      body: { candidates: [{ boxId: BOX, label: "FC-7K3M9-1", tier: "small", paidAt: ROW.paid_at }] },
    });
    expect(calls).toEqual([{ fn: "admin_held_link_candidates", args: { p_id: ID, p_nickname: "별빛" } }]);
  });

  it("INV-C12 (실패경로): 운영자가 아니면 404, 꼴이 틀리면 400, 줄 꼴이 틀리면 500", async () => {
    expect((await readLinkCandidates(fakeClient({ data: [ROW], error: null }, false).client, { kind: "candidates", id: ID, nickname: "별빛" })).status).toBe(404);
    expect((await readLinkCandidates(fakeClient({ data: [ROW], error: null }).client, { kind: "candidates", id: ID, nickname: "" })).status).toBe(400);
    expect((await readLinkCandidates(fakeClient({ data: [{ ...ROW, tier: "huge" }], error: null }).client, { kind: "candidates", id: ID, nickname: "별빛" })).status).toBe(500);
  });
});
