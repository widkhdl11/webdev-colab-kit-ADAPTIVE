// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chooseCancelledArrival, resolveHold, setCartonCount, submitTiers } from "./box-intake";

const HARU = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" } as const;
const BYEOLBIT = { userId: "00000000-0000-4000-a000-000000000001", role: "fan" } as const;
const BOX = "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10";
const APP = "0d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f";

function fakeClient(result: { data?: unknown; error?: { code: string } | null } = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        return { data: result.data ?? null, error: result.error ?? null };
      },
    } as never,
  };
}

describe("2페이지 「다음」 (revgift-box INV-GB1·GB10)", () => {
  it("INV-GB1 S1: 신청마다 고른 구간만 넘긴다 — 금액·상태·6자리는 보내지 않는다", async () => {
    const f = fakeClient({ data: "3479AC" });
    const r = await submitTiers({ client: f.client, viewer: HARU }, BOX, { tiers: { [APP]: "small" }, amountKrw: 100, status: "paid" });
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "revgift_box_submit_tiers", args: { p_box_id: BOX, p_tiers: { [APP]: "small" } } }]);
  });

  it("INV-GB1 S1c: 구간 없는 신청(P0022)은 409 「모든 팬의 상자 크기를 골라 주세요.」, 모르는 구간은 부르지 않고 400, 팬은 403", async () => {
    expect(await submitTiers({ client: fakeClient({ error: { code: "P0022" } }).client, viewer: HARU }, BOX, { tiers: { [APP]: "small" } })).toMatchObject({ ok: false, status: 409 });
    const f = fakeClient();
    for (const body of [{ tiers: { [APP]: "huge" } }, { tiers: { "not-uuid": "small" } }, { tiers: [] }, null]) {
      expect(await submitTiers({ client: f.client, viewer: HARU }, BOX, body)).toMatchObject({ ok: false, status: 400 });
    }
    expect(await submitTiers({ client: f.client, viewer: BYEOLBIT }, BOX, { tiers: {} })).toMatchObject({ ok: false, status: 403 });
    expect(f.calls).toEqual([]);
    expect(await submitTiers({ client: fakeClient({ error: { code: "P0002" } }).client, viewer: HARU }, BOX, { tiers: {} })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("3페이지 보낸 상자 수 (INV-GB11 Q8)", () => {
  it("INV-GB11 Q8: 1 이상 정수만 넘기고, 입고 뒤(P0022)는 409", async () => {
    const f = fakeClient();
    expect(await setCartonCount({ client: f.client, viewer: HARU }, BOX, { count: 2 })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "revgift_box_set_carton_count", args: { p_box_id: BOX, p_count: 2 } }]);
    for (const body of [{ count: 0 }, { count: 1.5 }, { count: "2" }]) {
      expect(await setCartonCount({ client: f.client, viewer: HARU }, BOX, body)).toMatchObject({ ok: false, status: 400 });
    }
    expect(await setCartonCount({ client: fakeClient({ error: { code: "P0022" } }).client, viewer: HARU }, BOX, { count: 2 })).toMatchObject({ ok: false, status: 409 });
  });
});

describe("확인 필요 팬 고르기 · 취소한 선물함 상자 (INV-GB12 · GB23)", () => {
  it("INV-GB12 S12c: 확인 필요와 신청만 넘긴다, 다른 선물함 팬(22023)은 400, 남의 것(P0002)은 404", async () => {
    const f = fakeClient();
    expect(await resolveHold({ client: f.client, viewer: HARU }, APP, { applicationId: APP })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "revgift_box_resolve_hold", args: { p_hold_id: APP, p_application_id: APP } }]);
    expect(await resolveHold({ client: fakeClient({ error: { code: "22023" } }).client, viewer: HARU }, APP, { applicationId: APP })).toMatchObject({ ok: false, status: 400 });
    expect(await resolveHold({ client: fakeClient({ error: { code: "P0002" } }).client, viewer: HARU }, APP, { applicationId: APP })).toMatchObject({ ok: false, status: 404 });
    expect(await resolveHold({ client: fakeClient().client, viewer: HARU }, APP, { applicationId: "x" })).toMatchObject({ ok: false, status: 400 });
  });

  it("INV-GB23 S23: 고를 수 있는 것은 다시 열기·돌려받기 둘, 이미 골랐으면(P0022) 409", async () => {
    const f = fakeClient();
    expect(await chooseCancelledArrival({ client: f.client, viewer: HARU }, APP, { choice: "return" })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "revgift_box_choose_cancelled_arrival", args: { p_card_id: APP, p_choice: "return" } }]);
    expect(await chooseCancelledArrival({ client: fakeClient().client, viewer: HARU }, APP, { choice: "dispose" })).toMatchObject({ ok: false, status: 400 });
    expect(await chooseCancelledArrival({ client: fakeClient({ error: { code: "P0022" } }).client, viewer: HARU }, APP, { choice: "reopen" })).toMatchObject({ ok: false, status: 409 });
  });
});
