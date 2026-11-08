import { describe, expect, it } from "vitest";
import { shipGiftBox, type BoxLabelOutcome } from "./ship-gift-box";

// 선물함 출고·반송 서버 쪽 (revgift-box INV-GB19·GB20). DB 는 가짜 — 판정(대표·꼴·응답 칸)은 진짜 코드를 지난다.

const FIELDS = { recipientName: "별빛", phone: "01012345678", zipCode: "04001", address1: "서울시 마포구 시험로 1", address2: "" };

function fake(o: { role: "owner" | "staff" | "none"; replies?: Record<string, { data: unknown; error: { code: string } | null }> }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      if (fn === "is_operator") return { data: o.role !== "none", error: null };
      if (fn === "is_owner") return { data: o.role === "owner", error: null };
      return o.replies?.[fn] ?? { data: null, error: { code: "XX000" } };
    },
  };
  const printed: string[] = [];
  const printLabel = async (label: string): Promise<BoxLabelOutcome> => (printed.push(label), { kind: "printed", waybill: null, reprint: false, label: FIELDS });
  return { deps: { client: client as never, printLabel }, calls, printed };
}

describe("INV-GB20: 선물함 출고", () => {
  it("INV-GB20 S20b (실패경로): 직원이 송장 출력 — 출력 함수는 부르되(거부 줄은 그 함수가 남긴다) 라벨은 내주지 않는다", async () => {
    const f = fake({ role: "staff" });
    const r = await shipGiftBox(f.deps, { kind: "print", label: "gb00000012" });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toContain("별빛");
    expect(f.printed).toEqual(["GB00000012"]);
  });

  it("INV-GB20: 대표 — 라벨 다섯 칸과 운송장 번호(수동 입력이면 null)만", async () => {
    const f = fake({ role: "owner" });
    expect(await shipGiftBox(f.deps, { kind: "print", label: "GB00000012" })).toEqual({ status: 200, body: { waybill: null, reprint: false, label: FIELDS } });
  });

  it("INV-GB20 (실패경로): 운영자가 아니면 404, 꼴이 틀린 바코드·남는 칸은 400 — DB 를 부르지 않는다", async () => {
    expect((await shipGiftBox(fake({ role: "none" }).deps, { kind: "lookup", label: "GB00000012" })).status).toBe(404);
    const f = fake({ role: "owner" });
    expect((await shipGiftBox(f.deps, { kind: "lookup", label: "Q-000001" })).status).toBe(400);
    expect((await shipGiftBox(f.deps, { kind: "print", label: "GB00000012", waybill: "123456789012" })).status).toBe(400);
    expect(f.calls.map((c) => c.fn).filter((n) => n.startsWith("office_"))).toEqual([]);
  });

  it("INV-GB9 (실패경로): 불러오기 응답에 칸이 하나라도 더 오면(주소 등) 받지 않는다", async () => {
    const row = { label: "GB00000012", nickname: "별빛", box_name: "겨울", box_status: "paid", status: "paid", printed: false, waybill: null, shipped: false, region_mismatch: false, tier: "small" };
    const ok = fake({ role: "staff", replies: { office_gift_box_outbound_lookup: { data: row, error: null } } });
    expect((await shipGiftBox(ok.deps, { kind: "lookup", label: "GB00000012" })).status).toBe(200);
    const extra = fake({ role: "staff", replies: { office_gift_box_outbound_lookup: { data: { ...row, address: "서울" }, error: null } } });
    expect((await shipGiftBox(extra.deps, { kind: "lookup", label: "GB00000012" })).status).toBe(500);
  });

  it("INV-P21 ③: 운송장 번호는 하이픈·띄어쓰기를 받아 숫자만 넘기고, 직원이면 DB 의 denied 를 403 으로", async () => {
    const f = fake({ role: "staff", replies: { office_gift_box_set_waybill: { data: "denied", error: null } } });
    expect((await shipGiftBox(f.deps, { kind: "set_waybill", label: "GB00000012", waybill: "1234-5678-9012" })).status).toBe(403);
    expect(f.calls.find((c) => c.fn === "office_gift_box_set_waybill")?.args).toEqual({ p_label: "GB00000012", p_waybill: "123456789012" });
  });

  it("INV-GB20: 다른 송장 바코드로 출고 확정 — 409 「이 신청의 송장이 아니에요」", async () => {
    const f = fake({ role: "staff", replies: { office_gift_box_confirm_shipment: { data: null, error: { code: "P0043" } } } });
    const r = await shipGiftBox(f.deps, { kind: "confirm_shipment", label: "GB00000012", waybill: "123456789012" });
    expect(r).toEqual({ status: 409, body: { message: "이 신청의 송장이 아니에요." } });
  });
});
