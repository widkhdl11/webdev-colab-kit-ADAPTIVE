import { describe, expect, it } from "vitest";
import { devWaybillNo } from "./dev-waybill";
import { scanOutbound, type OutboundDeps } from "./scan-outbound";

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
const LABEL = { recipientName: "김하루", phone: "01012345678", zipCode: "06236", address1: "서울시 강남구 테헤란로 123", address2: "101동" };
type LabelOutcome = Awaited<ReturnType<OutboundDeps["printLabel"]>>;
function giftPrinter(outcome: LabelOutcome) {
  const asked: string[] = [];
  return { asked, printLabel: async (qr: string) => (asked.push(qr), outcome) };
}
type ReturnOutcome = Awaited<ReturnType<OutboundDeps["printReturnLabel"]>>;
function returnPrinter(outcome: ReturnOutcome) {
  const asked: string[] = [];
  return { asked, printReturnLabel: async (qr: string) => (asked.push(qr), outcome) };
}
const deps = (client: never, printer = giftPrinter({ kind: "failed" }), back = returnPrinter({ kind: "not_linked" })) => ({
  client,
  newWaybill: () => NEW_WAYBILL,
  printLabel: printer.printLabel,
  printReturnLabel: back.printReturnLabel,
});

describe("출고 (office-workflow INV-W1·W3·W8)", () => {
  it("INV-R7·W3: 역조공 상자도 송장 출력 함수가 팬 주소를 열어 라벨 칸을 돌려준다 — 주소 없이 출력 단계로 넘기는 DB 함수는 부르지 않는다", async () => {
    const { calls, client } = fakeClient({});
    const printer = giftPrinter({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: LABEL });
    expect(await scanOutbound(deps(client, printer), { kind: "print_label", qr: "Q-000123" })).toEqual({
      status: 200,
      body: { waybill: NEW_WAYBILL, reprint: false, label: LABEL },
    });
    expect(printer.asked).toEqual(["Q-000123"]);
    expect(calls).toEqual([]);
  });

  it("INV-P4·W3: 팬 선물 상자의 송장 출력은 송장 출력 함수가 주소를 열어 라벨 칸을 돌려준다 — 앱 서버는 DB 출력 함수를 따로 부르지 않는다", async () => {
    const { calls, client } = fakeClient({});
    const printer = giftPrinter({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: LABEL });
    expect(await scanOutbound(deps(client, printer), { kind: "print_label", qr: "Q-000123" })).toEqual({
      status: 200,
      body: { waybill: NEW_WAYBILL, reprint: false, label: LABEL },
    });
    expect(calls).toEqual([]);
  });

  it("INV-P4·P5·P14 (실패경로): 송장 출력 함수가 거부하면 409 와 사유별 문구, 주소 칸은 없다", async () => {
    const reasons = ["no_valid_approval", "order_mismatch", "order_not_printable", "difference_unpaid", "decrypt_limit_reached", "address_mismatch"] as const;
    const texts = new Set<string>();
    for (const reason of reasons) {
      const { calls, client } = fakeClient({});
      const reply = await scanOutbound(deps(client, giftPrinter({ kind: "denied", reason })), { kind: "print_label", qr: "Q-000123" });
      expect(reply.status).toBe(409);
      expect(reply.body.reason).toBe("not_shippable");
      expect(reply.body).not.toHaveProperty("label");
      texts.add(String(reply.body.message));
      expect(calls).toEqual([]);
    }
    expect(texts.size).toBe(reasons.length);
  });

  it("INV-P8 (실패경로): 송장 출력 함수가 대표가 아니라고 하면 403, 토큰을 못 믿으면 401", async () => {
    const notOwner = fakeClient({});
    expect((await scanOutbound(deps(notOwner.client, giftPrinter({ kind: "denied", reason: "not_owner" })), { kind: "print_label", qr: "Q-000123" })).status).toBe(403);
    const noToken = fakeClient({});
    expect((await scanOutbound(deps(noToken.client, giftPrinter({ kind: "unauthenticated" })), { kind: "print_label", qr: "Q-000123" })).status).toBe(401);
  });

  it("주소 미등록 409 · 없는 상자 404 · 실패 500", async () => {
    const c = () => fakeClient({}).client;
    expect((await scanOutbound(deps(c(), giftPrinter({ kind: "no_address" })), { kind: "print_label", qr: "Q-000123" })).status).toBe(409);
    expect((await scanOutbound(deps(c(), giftPrinter({ kind: "not_found" })), { kind: "print_label", qr: "Q-000123" })).status).toBe(404);
    expect((await scanOutbound(deps(c(), giftPrinter({ kind: "failed" })), { kind: "print_label", qr: "Q-000123" })).status).toBe(500);
  });

  it("INV-W3·P7 (실패경로): 직원이 송장 출력을 누르면 송장 출력 함수가 거부(not_owner)하고 403 — 거부 줄은 그 함수가 남긴다", async () => {
    const { calls, client } = fakeClient({}, { operator: true, owner: false });
    const printer = giftPrinter({ kind: "denied", reason: "not_owner" });
    expect(await scanOutbound(deps(client, printer), { kind: "print_label", qr: "Q-000123" })).toEqual({ status: 403, body: { message: "송장 출력은 대표만 할 수 있어요." } });
    expect(printer.asked).toEqual(["Q-000123"]);
    expect(calls).toEqual([]);
  });

  it("INV-W3 (실패경로): 송장 출력 함수가 잘못해 직원에게 라벨을 돌려줘도 화면에는 라벨을 내주지 않는다", async () => {
    const { client } = fakeClient({}, { operator: true, owner: false });
    const printer = giftPrinter({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: LABEL });
    const reply = await scanOutbound(deps(client, printer), { kind: "print_label", qr: "Q-000123" });
    expect(reply).toEqual({ status: 403, body: { message: "송장 출력은 대표만 할 수 있어요." } });
    expect(JSON.stringify(reply)).not.toContain(LABEL.address1);
  });

  it("INV-R13 (실패경로): 송장 출력 함수가 실패하면 500 — 주소 없이 DB 출력 함수로 대신 넘기지 않는다", async () => {
    const { calls, client } = fakeClient({});
    expect(await scanOutbound(deps(client, giftPrinter({ kind: "failed" })), { kind: "print_label", qr: "Q-000123" })).toEqual({
      status: 500,
      body: { message: "처리하지 못했어요. 잠시 뒤 다시 해 주세요." },
    });
    expect(calls).toEqual([]);
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

  it("INV-W8 · P18 (S18): 주문에 이어진 상자의 반송 송장은 반송 송장 출력 함수가 확인한 주소를 열어 라벨 칸을 돌려준다 — 봉투 번호 DB 함수는 부르지 않는다", async () => {
    const { calls, client } = fakeClient({});
    const back = returnPrinter({ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: LABEL });
    expect(await scanOutbound(deps(client, undefined, back), { kind: "print_return", qr: "Q-000123" })).toEqual({
      status: 200,
      body: { waybill: NEW_WAYBILL, reprint: false, label: LABEL },
    });
    expect(back.asked).toEqual(["Q-000123"]);
    expect(calls).toEqual([]);
  });

  it("INV-P18 (S18b, 실패경로): 직원이 주문에 이어진 상자의 반송 송장을 누르면 출력 함수까지 보내 거부 줄을 남기게 하고, 어떤 답이든 라벨 없이 403", async () => {
    for (const outcome of [{ kind: "printed", waybill: NEW_WAYBILL, reprint: false, label: LABEL }, { kind: "denied", reason: "not_owner" }] as const) {
      const { calls, client } = fakeClient({}, { operator: true, owner: false });
      const back = returnPrinter(outcome);
      const reply = await scanOutbound(deps(client, undefined, back), { kind: "print_return", qr: "Q-000123" });
      expect(reply.status).toBe(403);
      expect(reply.body).not.toHaveProperty("label");
      expect(back.asked).toEqual(["Q-000123"]);
      expect(calls).toEqual([]);
    }
  });

  it("INV-W15 · P18 (S15b, 실패경로): 확인 전·상한·계정 불일치 거부는 409 not_shippable(라벨 없음), 없는 상자 404, 실패 500 — 봉투 번호 길로 넘어가지 않는다", async () => {
    for (const reason of ["no_valid_approval", "order_not_printable", "decrypt_limit_reached", "address_mismatch"] as const) {
      const { calls, client } = fakeClient({});
      const reply = await scanOutbound(deps(client, undefined, returnPrinter({ kind: "denied", reason })), { kind: "print_return", qr: "Q-000123" });
      expect([reason, reply.status, reply.body.reason]).toEqual([reason, 409, "not_shippable"]);
      expect(reply.body).not.toHaveProperty("label");
      expect(calls).toEqual([]);
    }
    const missing = fakeClient({});
    expect((await scanOutbound(deps(missing.client, undefined, returnPrinter({ kind: "not_found" })), { kind: "print_return", qr: "Q-000123" })).status).toBe(404);
    const failed = fakeClient({});
    expect((await scanOutbound(deps(failed.client, undefined, returnPrinter({ kind: "failed" })), { kind: "print_return", qr: "Q-000123" })).status).toBe(500);
    expect(failed.calls).toEqual([]);
  });

  it("INV-W15 (S15d): 처분 대상 상자의 QR 스캔 → 처분 기록, 처분 대상이 아니면 409", async () => {
    const { calls, client } = fakeClient({ office_record_disposal: { data: "disposed", error: null } });
    expect(await scanOutbound(deps(client), { kind: "record_disposal", qr: "Q-000123" })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "office_record_disposal", args: { p_qr: "Q-000123" } }]);
    const wrong = fakeClient({ office_record_disposal: { error: { code: "55000" } } });
    expect((await scanOutbound(deps(wrong.client), { kind: "record_disposal", qr: "Q-000123" })).status).toBe(409);
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
