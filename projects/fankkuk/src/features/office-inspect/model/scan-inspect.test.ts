import { describe, expect, it } from "vitest";
import { scanInspect } from "./scan-inspect";

const DETAIL = {
  qr: "Q-000123",
  kind: "gift",
  order_no: "FC-261003-0041",
  sender_nickname: "별빛",
  receiver_name: "하루",
  tier: "small",
  state: "labeled",
  next_step: "inspect",
  envelope_no: "Q-000123",
  outbound_waybill_no: null,
  return_waybill_no: null,
};

type Reply = { data?: unknown; error: { code: string } | null };

function fakeClient(replies: Record<string, Reply>, who = { operator: true, owner: false }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: who.operator, error: null };
      if (fn === "is_owner") return { data: who.owner, error: null };
      calls.push({ fn, args });
      const r = replies[fn] ?? { error: { code: "XX000" } };
      return { data: r.data ?? null, error: r.error };
    },
  } as never;
  return { calls, client };
}

const TRACKER = { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" };

describe("검수 (office-workflow INV-W1·W4)", () => {
  it("INV-W1: QR 로 상자를 불러온다", async () => {
    const { calls, client } = fakeClient({ office_parcel_by_qr: { data: [DETAIL], error: null } });
    const reply = await scanInspect(client, { kind: "lookup", qr: "Q-000123" });
    expect(reply.status).toBe(200);
    expect(reply.body.parcel).toMatchObject({ qr: "Q-000123", state: "labeled", nextStep: "inspect" });
    expect(calls).toEqual([{ fn: "office_parcel_by_qr", args: { p_qr: "Q-000123" } }]);
  });

  it("INV-W1 (실패경로): 없는 QR 은 404, 상자 답의 꼴이 다르면 500", async () => {
    expect((await scanInspect(fakeClient({ office_parcel_by_qr: { error: { code: "P0002" } } }).client, { kind: "lookup", qr: "Q-000999" })).status).toBe(404);
    expect((await scanInspect(fakeClient({ office_parcel_by_qr: { data: [], error: null } }).client, { kind: "lookup", qr: "Q-000123" })).status).toBe(500);
  });

  it("INV-W4 S4c: 추적 장치가 나온 팬 선물 — 「보관」 기록을 그대로 DB 에 넘긴다", async () => {
    const { calls, client } = fakeClient({ office_record_inspection: { error: null } });
    expect(await scanInspect(client, { kind: "record", qr: "Q-000123", result: TRACKER })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "office_record_inspection", args: { p_qr: "Q-000123", p_result: TRACKER } }]);
  });

  it("INV-W4 (실패경로): 검사 결과와 맞지 않는 결론·모르는 칸은 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      { kind: "record", qr: "Q-000123", result: { ...TRACKER, outcome: "pass" } },
      { kind: "record", qr: "Q-000123", result: { surface: "found", prohibited: "clear", outcome: "pass" } },
      { kind: "record", qr: "Q-000123", result: { ...TRACKER, inspector: "라임" } },
      { kind: "record", qr: "bad", result: TRACKER },
      { kind: "complete", qr: "Q-000123", state: "inspected" },
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient({});
      expect((await scanInspect(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-W4 S4b (실패경로): 같은 상자에 두 번째 기록은 DB 가 55000 으로 막고 409 — 기록은 고칠 수 없다고 알린다", async () => {
    const { calls, client } = fakeClient({ office_record_inspection: { error: { code: "55000" } } });
    expect(await scanInspect(client, { kind: "record", qr: "Q-000123", result: TRACKER })).toEqual({
      status: 409,
      body: { message: "이미 검수 기록이 있어요. 기록은 고칠 수 없어요.", reason: "wrong_step" },
    });
    expect(calls).toEqual([{ fn: "office_record_inspection", args: { p_qr: "Q-000123", p_result: TRACKER } }]);
  });

  it("INV-W1·W4: QR 다시 스캔 → DB 가 정한 다음 상태를 돌려준다", async () => {
    for (const state of ["inspected", "return_waiting", "held"]) {
      const { calls, client } = fakeClient({ office_scan_inspect: { data: state, error: null } });
      expect(await scanInspect(client, { kind: "complete", qr: "Q-000123" })).toEqual({ status: 200, body: { state } });
      expect(calls).toEqual([{ fn: "office_scan_inspect", args: { p_qr: "Q-000123" } }]);
    }
  });

  it("INV-W4 S4 (실패경로): 검수 기록 없이 스캔하면 409 + no_inspection", async () => {
    const { client } = fakeClient({ office_scan_inspect: { error: { code: "P0044" } } });
    expect(await scanInspect(client, { kind: "complete", qr: "Q-000123" })).toEqual({
      status: 409,
      body: { message: "검수 기록을 먼저 저장해 주세요.", reason: "no_inspection" },
    });
  });

  it("INV-W1 (실패경로): DB 가 모르는 상태를 돌려주면 500", async () => {
    const { client } = fakeClient({ office_scan_inspect: { data: "shipped", error: null } });
    expect((await scanInspect(client, { kind: "complete", qr: "Q-000123" })).status).toBe(500);
  });

  it("INV-W1 (실패경로): 운영자가 아니면 404 — 쓰기 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({}, { operator: false, owner: false });
    expect((await scanInspect(client, { kind: "record", qr: "Q-000123", result: TRACKER })).status).toBe(404);
    expect(calls).toEqual([]);
  });
});
