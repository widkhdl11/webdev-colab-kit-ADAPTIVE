import { describe, expect, it } from "vitest";
import { devWaybillNo } from "./dev-waybill";
import { scanOutbound } from "./scan-outbound";

type Reply = { data?: unknown; error: { code: string } | null };

function fakeClient(replies: Record<string, Reply>, who = { operator: true, owner: true }) {
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

const NEW_WAYBILL = "555566667777";
const deps = (client: never) => ({ client, newWaybill: () => NEW_WAYBILL });

describe("출고 (office-workflow INV-W1·W3·W8)", () => {
  it("INV-W3: 대표가 송장 출력 → 서버가 만든 송장번호를 DB 에 넘기고 돌려준다", async () => {
    const { calls, client } = fakeClient({ office_print_label: { error: null } });
    expect(await scanOutbound(deps(client), { kind: "print_label", qr: "Q-000123" })).toEqual({ status: 200, body: { waybill: NEW_WAYBILL } });
    expect(calls).toEqual([{ fn: "office_print_label", args: { p_qr: "Q-000123", p_waybill: NEW_WAYBILL } }]);
  });

  it("INV-W3 (실패경로): 직원이 송장 출력을 부르면 403 — DB 출력 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({ office_print_label: { error: null } }, { operator: true, owner: false });
    expect(await scanOutbound(deps(client), { kind: "print_label", qr: "Q-000123" })).toEqual({ status: 403, body: { message: "송장 출력은 대표만 할 수 있어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-W3 S3·S3b (실패경로): 출고 조건이 안 되면 409(P0041), 검수 완료가 아니면 409(55000)", async () => {
    const notYet = fakeClient({ office_print_label: { error: { code: "P0041" } } });
    expect(await scanOutbound(deps(notYet.client), { kind: "print_label", qr: "Q-000123" })).toEqual({
      status: 409,
      body: { message: "출고 조건이 아직 안 됐어요.", reason: "not_shippable" },
    });
    const wrongStep = fakeClient({ office_print_label: { error: { code: "55000" } } });
    expect((await scanOutbound(deps(wrongStep.client), { kind: "print_label", qr: "Q-000123" })).status).toBe(409);
  });

  it("INV-W1: 출력한 송장 바코드 스캔 → 출고 확정. 이 상자 송장이 아니면 400(P0043)", async () => {
    const ok = fakeClient({ office_confirm_shipment: { error: null } });
    expect(await scanOutbound(deps(ok.client), { kind: "confirm_shipment", qr: "Q-000123", waybill: "555566667777" })).toEqual({ status: 200, body: { ok: true } });
    expect(ok.calls).toEqual([{ fn: "office_confirm_shipment", args: { p_qr: "Q-000123", p_waybill: "555566667777" } }]);
    const wrong = fakeClient({ office_confirm_shipment: { error: { code: "P0043" } } });
    expect(await scanOutbound(deps(wrong.client), { kind: "confirm_shipment", qr: "Q-000123", waybill: "111122223333" })).toEqual({
      status: 400,
      body: { message: "이 상자의 라벨·송장이 아니에요.", reason: "wrong_code" },
    });
  });

  it("INV-W2 S2 (실패경로): 출고 확정 두 번째 스캔은 409", async () => {
    const { client } = fakeClient({ office_confirm_shipment: { error: { code: "55000" } } });
    expect((await scanOutbound(deps(client), { kind: "confirm_shipment", qr: "Q-000123", waybill: "555566667777" })).status).toBe(409);
  });

  it("INV-W8 S8: 반송 송장은 직원도 — 봉투 번호와 송장번호를 돌려준다", async () => {
    const { calls, client } = fakeClient({ office_print_return_label: { data: "Q-000123", error: null } }, { operator: true, owner: false });
    expect(await scanOutbound(deps(client), { kind: "print_return", qr: "Q-000123" })).toEqual({ status: 200, body: { waybill: NEW_WAYBILL, envelopeNo: "Q-000123" } });
    expect(calls).toEqual([{ fn: "office_print_return_label", args: { p_qr: "Q-000123", p_waybill: NEW_WAYBILL } }]);
  });

  it("INV-W8 S8b (실패경로): 반송 대기가 아니면 409, 봉투 번호가 비면 500", async () => {
    const wrongStep = fakeClient({ office_print_return_label: { error: { code: "55000" } } });
    expect((await scanOutbound(deps(wrongStep.client), { kind: "print_return", qr: "Q-000123" })).status).toBe(409);
    const empty = fakeClient({ office_print_return_label: { data: null, error: null } });
    expect((await scanOutbound(deps(empty.client), { kind: "print_return", qr: "Q-000123" })).status).toBe(500);
  });

  it("INV-W8: 반송 송장 바코드 스캔 → 반송 확정", async () => {
    const { calls, client } = fakeClient({ office_confirm_return: { error: null } });
    expect(await scanOutbound(deps(client), { kind: "confirm_return", qr: "Q-000123", waybill: "555566667777" })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "office_confirm_return", args: { p_qr: "Q-000123", p_waybill: "555566667777" } }]);
  });

  it("INV-W1 (실패경로): 송장번호를 화면이 보내는 출력·꼴이 틀린 값은 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      { kind: "print_label", qr: "Q-000123", waybill: "555566667777" }, // 출력 송장번호는 서버가 만든다
      { kind: "print_return", qr: "Q-000123", envelopeNo: "Q-000999" }, // 봉투를 고르는 칸은 없다(INV-W8)
      { kind: "confirm_shipment", qr: "Q-000123", waybill: "12" },
      { kind: "confirm_return", qr: "Q-12", waybill: "555566667777" },
      { kind: "ship", qr: "Q-000123" },
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient({});
      expect((await scanOutbound(deps(client), body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-W1 (실패경로): 운영자가 아니면 404 — 쓰기 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({}, { operator: false, owner: false });
    expect(await scanOutbound(deps(client), { kind: "print_return", qr: "Q-000123" })).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-W1: QR 로 상자를 불러온다", async () => {
    const row = {
      qr: "Q-000123",
      kind: "revgift",
      order_no: "RG-1",
      sender_nickname: "하루",
      receiver_name: "모카",
      tier: "small",
      state: "inspected",
      next_step: "wait_accept",
      envelope_no: "Q-000123",
      outbound_waybill_no: null,
      return_waybill_no: null,
    };
    const { client } = fakeClient({ office_parcel_by_qr: { data: row, error: null } }, { operator: true, owner: false });
    const reply = await scanOutbound(deps(client), { kind: "lookup", qr: "Q-000123" });
    expect(reply.status).toBe(200);
    expect(reply.body.parcel).toMatchObject({ nextStep: "wait_accept" });
  });
});

describe("개발용 송장번호 (택배사 API 전, office-workflow 비범위)", () => {
  it("INV-W1: 숫자 12자리라 송장 스캔 꼴을 통과하고, 매번 다르다", () => {
    const made = new Set(Array.from({ length: 50 }, () => devWaybillNo()));
    for (const n of made) expect(n).toMatch(/^[0-9]{12}$/);
    expect(made.size).toBeGreaterThan(45);
  });
});
