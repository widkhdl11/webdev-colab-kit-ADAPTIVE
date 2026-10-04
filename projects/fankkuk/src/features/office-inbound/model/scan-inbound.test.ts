import { describe, expect, it } from "vitest";
import { scanInbound } from "./scan-inbound";

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";
const DETAIL = {
  qr: "Q-000123",
  kind: "gift",
  order_no: "FC-261003-0041",
  sender_nickname: "별빛",
  receiver_name: "하루",
  tier: "small",
  state: "received",
  next_step: "confirm_label",
  envelope_no: "Q-000123",
  outbound_waybill_no: null,
  return_waybill_no: null,
};

type Reply = { data?: unknown; error: { code: string } | null };

/** 로그인한 사람의 세션 클라이언트 대역. 판정 함수(is_operator·is_owner)는 who 로, 나머지는 replies[fn] 으로 답한다. */
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

describe("입고 스캔 (office-workflow INV-W1·W2·W5)", () => {
  it("INV-W1 S1: 원 송장 스캔 → 입고 완료와 라벨 QR, 그 상자 정보를 같이 돌려준다", async () => {
    const { calls, client } = fakeClient({
      office_scan_inbound: { data: { result: "received", qr: "Q-000123", order_no: "FC-261003-0041" }, error: null },
      office_parcel_by_qr: { data: [DETAIL], error: null },
    });
    const reply = await scanInbound(client, { kind: "waybill", waybill: "123456789012" });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ result: "received", qr: "Q-000123", orderNo: "FC-261003-0041", parcel: { senderNickname: "별빛", tier: "small" } });
    expect(calls[0]).toEqual({ fn: "office_scan_inbound", args: { p_waybill: "123456789012" } });
  });

  it("INV-W5 S5: 맞는 상자가 없으면 「미확인」 — 상자 조회는 하지 않는다", async () => {
    const { calls, client } = fakeClient({ office_scan_inbound: { data: { result: "unmatched", qr: null, order_no: null }, error: null } });
    const reply = await scanInbound(client, { kind: "waybill", waybill: "1234567890" });
    expect(reply).toEqual({ status: 200, body: { result: "unmatched", qr: null, orderNo: null, parcel: null } });
    expect(calls.map((c) => c.fn)).toEqual(["office_scan_inbound"]);
  });

  it("INV-W1: 라벨을 다시 낸 경우(reprinted)도 200 — 라벨 QR 과 상자 정보를 돌려준다", async () => {
    const { client } = fakeClient({
      office_scan_inbound: { data: { result: "reprinted", qr: "Q-000123", order_no: "FC-261003-0041" }, error: null },
      office_parcel_by_qr: { data: [DETAIL], error: null },
    });
    const reply = await scanInbound(client, { kind: "waybill", waybill: "123456789012" });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ result: "reprinted", qr: "Q-000123", orderNo: "FC-261003-0041", parcel: { qr: "Q-000123" } });
  });

  it("INV-W5: 이미 미확인으로 기록한 송장이면 unmatched_recorded — 상자 조회도, 기록 양식도 없다", async () => {
    const { calls, client } = fakeClient({ office_scan_inbound: { data: { result: "unmatched_recorded", qr: null, order_no: null }, error: null } });
    expect(await scanInbound(client, { kind: "waybill", waybill: "1234567890" })).toEqual({
      status: 200,
      body: { result: "unmatched_recorded", qr: null, orderNo: null, parcel: null },
    });
    expect(calls.map((c) => c.fn)).toEqual(["office_scan_inbound"]);
  });

  it("INV-W1: 입고는 됐는데 상자 조회만 실패하면 parcel 만 null 로 200 — 입고 결과는 그대로 알린다", async () => {
    const { client } = fakeClient({
      office_scan_inbound: { data: { result: "received", qr: "Q-000123", order_no: "FC-1" }, error: null },
      office_parcel_by_qr: { error: { code: "XX000" } },
    });
    expect(await scanInbound(client, { kind: "waybill", waybill: "1234567890" })).toEqual({
      status: 200,
      body: { result: "received", qr: "Q-000123", orderNo: "FC-1", parcel: null },
    });
  });

  it("INV-W5 (실패경로): 주인이 있거나 이미 기록한 송장을 미확인으로 또 기록하면 409", async () => {
    const { client } = fakeClient({ office_record_unmatched: { error: { code: "55000" } } });
    expect(await scanInbound(client, { kind: "unmatched", waybill: "1234567890", senderInitial: "별", shelf: "A-03" })).toEqual({
      status: 409,
      body: { message: "이미 주인이 있거나 미확인 입고로 기록된 송장이에요.", reason: "wrong_step" },
    });
  });

  it("INV-W1 (실패경로): DB 답의 꼴이 다르면 500 — 라벨이 나간 것처럼 보이지 않는다", async () => {
    const { client } = fakeClient({ office_scan_inbound: { data: { result: "received", qr: "bad", order_no: "FC-1" }, error: null } });
    expect((await scanInbound(client, { kind: "waybill", waybill: "1234567890" })).status).toBe(500);
  });

  it("INV-W2 S2b (실패경로): 앞 상자 라벨 부착 전이면 409 + pending_label", async () => {
    const { client } = fakeClient({ office_scan_inbound: { error: { code: "P0042" } } });
    expect(await scanInbound(client, { kind: "waybill", waybill: "1234567890" })).toEqual({
      status: 409,
      body: { message: "앞 상자 라벨 부착을 먼저 확인해 주세요.", reason: "pending_label" },
    });
  });

  it("INV-W2: 라벨 QR 스캔 → 부착 확인. 직전 라벨이 아니면 400(P0043), 이미 처리됐으면 409(55000)", async () => {
    const ok = fakeClient({ office_confirm_label: { error: null } });
    expect(await scanInbound(ok.client, { kind: "label", qr: "Q-000123" })).toEqual({ status: 200, body: { ok: true } });
    expect(ok.calls).toEqual([{ fn: "office_confirm_label", args: { p_qr: "Q-000123" } }]);
    const wrong = fakeClient({ office_confirm_label: { error: { code: "P0043" } } });
    expect((await scanInbound(wrong.client, { kind: "label", qr: "Q-000999" })).status).toBe(400);
    const twice = fakeClient({ office_confirm_label: { error: { code: "55000" } } });
    expect((await scanInbound(twice.client, { kind: "label", qr: "Q-000123" })).status).toBe(409);
  });

  it("INV-W5·W7: 미확인 입고 기록 — 앞 한 글자·선반만 넘긴다(앞뒤 공백 뗌)", async () => {
    const { calls, client } = fakeClient({ office_record_unmatched: { data: ID, error: null } });
    const reply = await scanInbound(client, { kind: "unmatched", waybill: "1234567890", senderInitial: " 별 ", shelf: " A-03 " });
    expect(reply).toEqual({ status: 200, body: { ok: true, id: ID } });
    expect(calls).toEqual([{ fn: "office_record_unmatched", args: { p_waybill: "1234567890", p_sender_initial: "별", p_shelf: "A-03" } }]);
  });

  it("INV-W7 (실패경로): 이름 두 글자 이상·빈 선반·21자 선반·모르는 칸은 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      { kind: "unmatched", waybill: "1234567890", senderInitial: "별빛", shelf: "A-03" },
      { kind: "unmatched", waybill: "1234567890", senderInitial: "", shelf: "A-03" },
      { kind: "unmatched", waybill: "1234567890", senderInitial: "별", shelf: "  " },
      { kind: "unmatched", waybill: "1234567890", senderInitial: "별", shelf: "가".repeat(21) },
      { kind: "unmatched", waybill: "1234567890", senderInitial: "별", shelf: "A-03", phone: "010" },
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient({});
      expect((await scanInbound(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-W1 (실패경로): 꼴이 틀린 스캔 값·상태를 고르는 몸통은 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      null,
      { kind: "waybill", waybill: "123" },
      { kind: "waybill", waybill: "123456789012345" },
      { kind: "label", qr: "Q-12" },
      { kind: "label", qr: "Q-000123", orderNo: "FC-1" },
      { kind: "set_state", qr: "Q-000123", state: "shipped" },
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient({});
      expect((await scanInbound(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-W1 (실패경로): 운영자가 아니면 404 — 쓰기 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({}, { operator: false, owner: false });
    expect(await scanInbound(client, { kind: "waybill", waybill: "1234567890" })).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-W1: DB 권한 거부·없음·기타는 403·404·500", async () => {
    for (const [code, status] of [
      ["42501", 403],
      ["P0002", 404],
      ["22023", 400],
      ["XX000", 500],
    ] as const) {
      const { client } = fakeClient({ office_confirm_label: { error: { code } } });
      expect((await scanInbound(client, { kind: "label", qr: "Q-000123" })).status).toBe(status);
    }
  });
});
