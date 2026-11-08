// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scanGiftBox } from "./scan-gift-box";

// 선물함 입고·실측 화면의 서버 쪽 (revgift-box INV-GB10·GB12·GB13·GB16). 판정은 DB 가 하고, 여기서는 꼴만 보고 답을 고른다.

function fakeClient(result: { data?: unknown; error?: { code: string } | null } = {}, admin = true) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: unknown) => {
        if (fn === "is_operator") return { data: admin, error: null };
        if (fn === "is_owner") return { data: false, error: null };
        calls.push({ fn, args });
        return { data: result.data ?? null, error: result.error ?? null };
      },
    } as never,
  };
}

describe("선물함 입고 (INV-GB10 · GB13)", () => {
  it("INV-GB13: 6자리·원 송장번호·착불 금액·선반만 넘긴다", async () => {
    const f = fakeClient({ data: { result: "received", box_id: "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10", box_name: "겨울" } });
    const r = await scanGiftBox(f.client, { kind: "receive", code: "3479ac", waybillNo: "123456789012", codFeeKrw: 6000, shelf: "A-1" });
    expect(r).toEqual({ status: 200, body: { result: "received", boxName: "겨울" } });
    expect(f.calls).toEqual([{ fn: "office_gift_box_receive", args: { p_code: "3479AC", p_waybill_no: "123456789012", p_cod_fee_krw: 6000, p_shelf: "A-1" } }]);
  });

  it("INV-GB13 S13c: 착불 금액이 음수·소수·상한 초과면 부르지 않고 400", async () => {
    const f = fakeClient();
    for (const cod of [-1, 1.5, 100001]) {
      expect((await scanGiftBox(f.client, { kind: "receive", code: "3479AC", waybillNo: "123456789012", codFeeKrw: cod, shelf: "A-1" })).status).toBe(400);
    }
    expect(f.calls).toEqual([]);
  });

  it("운영자가 아니면 404 — DB 를 부르지 않는다", async () => {
    const f = fakeClient({}, false);
    expect((await scanGiftBox(f.client, { kind: "lookup", code: "3479AC" })).status).toBe(404);
    expect(f.calls).toEqual([]);
  });
});

describe("선물 실측 (INV-GB12 · GB16)", () => {
  it("INV-GB12: 바코드 또는 닉네임 하나 + 세 변 합·무게 — 구간은 보내지 않는다(DB 가 정함)", async () => {
    const f = fakeClient({ data: { result: "measured", nickname: "별빛", tier: "medium" } });
    const r = await scanGiftBox(f.client, { kind: "measure", code: "3479AC", label: "gb00000012", sizeCm: 110, weightKg: 3 });
    expect(r).toEqual({ status: 200, body: { result: "measured", nickname: "별빛", tier: "medium" } });
    expect(f.calls).toEqual([
      { fn: "office_gift_box_measure", args: { p_code: "3479AC", p_label: "GB00000012", p_nickname: null, p_size_cm: 110, p_weight_kg: 3, p_personal_krw: null } },
    ]);
  });

  it("INV-GB12: 바코드와 닉네임을 둘 다 주거나 둘 다 없으면 400, 구간을 같이 보내도 받지 않는다", async () => {
    const f = fakeClient();
    for (const body of [
      { kind: "measure", code: "3479AC", label: "GB00000012", nickname: "별빛", sizeCm: 10, weightKg: 1 },
      { kind: "measure", code: "3479AC", sizeCm: 10, weightKg: 1 },
      { kind: "measure", code: "3479AC", label: "GB00000012", sizeCm: 10, weightKg: 1, tier: "xsmall" },
      { kind: "measure", code: "3479AC", label: "GB00000012", sizeCm: 0, weightKg: 1 },
    ]) {
      expect((await scanGiftBox(f.client, body)).status).toBe(400);
    }
    expect(f.calls).toEqual([]);
  });

  it("INV-GB16 S16b: 실비 범위 밖(DB 22023)은 400 실비 안내, 이미 실측(55000)은 409, 도착 전(P0022)은 409", async () => {
    const m = { kind: "measure", code: "3479AC", label: "GB00000012", sizeCm: 150, weightKg: 12, personalKrw: 5000 };
    expect((await scanGiftBox(fakeClient({ error: { code: "22023" } }).client, m)).status).toBe(400);
    expect((await scanGiftBox(fakeClient({ error: { code: "55000" } }).client, m)).status).toBe(409);
    expect((await scanGiftBox(fakeClient({ error: { code: "P0022" } }).client, m)).status).toBe(409);
  });

  it("INV-GB10: 불러오기 답의 신청 줄에 닉네임·신청 번호·상태·구간 밖의 칸이 섞이면 500", async () => {
    const row = { id: "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10", name: "겨울", status: "arrived", carton_count: 1, cartons_received: 1, open_holds: 0 };
    const ok = await scanGiftBox(fakeClient({ data: { ...row, applications: [{ label: "GB00000012", nickname: "별빛", status: "selected", tier: null }] } }).client, { kind: "lookup", code: "3479AC" });
    expect(ok.status).toBe(200);
    const bad = await scanGiftBox(
      fakeClient({ data: { ...row, applications: [{ label: "GB00000012", nickname: "별빛", status: "selected", tier: null, address: "서울" }] } }).client,
      { kind: "lookup", code: "3479AC" },
    );
    expect(bad.status).toBe(500);
  });
});
