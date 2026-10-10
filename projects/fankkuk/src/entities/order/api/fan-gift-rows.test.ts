import { describe, expect, it } from "vitest";
import { parseFanGiftRows } from "./fan-gift-rows";

// my_gifts 읽기 함수가 돌려주는 한 줄 → 팬 화면 모양. 응답은 신뢰 경계 밖이라 형식이 다르면 받지 않는다.
const row = {
  order_no: "FC-W5N3T",
  creator_name: "모모",
  item_kind: "손편지와 머리끈",
  box_count: 1,
  has_electronics_or_metal: false,
  status: "inspected",
  registered_at: "2026-10-02T02:00:00+00:00",
  approved_at: null,
  received_at: "2026-10-03T01:10:00+00:00",
  inspection_result: "passed",
  inspected_at: "2026-10-03T02:00:00+00:00",
  shipped_at: null,
  expected_arrival_date: null,
  delivery: null,
  fan_tracking_no: "584012379911",
  fan_send_ack_at: null,
};

describe("my_gifts 응답 → 팬 화면", () => {
  it("검수가 끝나고 승인을 기다리는 선물은 승인 갈래가 waiting 이고 사무실 주소가 있다(INV-S9)", () => {
    const [view] = parseFanGiftRows([row], "사무실 주소");
    expect(view!.orderNo).toBe("FC-W5N3T");
    expect(view!.approval).toEqual({ state: "waiting", at: null });
    expect(view!.officeAddress).toBe("사무실 주소");
    expect(view!.steps.find((s) => s.key === "inspected")?.state).toBe("done");
  });

  it("거절된 선물에는 사무실 주소를 넣지 않는다(INV-S9, S9b)", () => {
    const [view] = parseFanGiftRows([{ ...row, status: "rejected", received_at: null, inspection_result: null, inspected_at: null }], "사무실 주소");
    expect(view!.outcome).toBe("declined");
    expect(view!.officeAddress).toBeNull();
  });

  it("모르는 상태·빠진 칸이 있으면 받지 않는다", () => {
    expect(() => parseFanGiftRows([{ ...row, status: "approved" }], "x")).toThrow();
    expect(() => parseFanGiftRows([{ ...row, order_no: undefined }], "x")).toThrow();
    expect(() => parseFanGiftRows("nope", "x")).toThrow();
  });

  it("크리에이터행 송장번호 칸이 섞여 와도 팬 화면 모양에는 들어가지 않는다", () => {
    const [view] = parseFanGiftRows([{ ...row, outbound_waybill_no: "612345678901" }], "x");
    expect(JSON.stringify(view)).not.toContain("612345678901");
  });
});
