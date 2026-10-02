import { describe, expect, it } from "vitest";
import { parseApprovalRequestRows, parseDecidedRequestRows } from "./creator-request-rows";

const waiting = {
  request_id: "apr_FCL5T6B",
  order_no: "FC-L5T6B",
  fan_nickname: "달토끼",
  item_kind: "게임 패드와 간식",
  box_count: 2,
  has_electronics_or_metal: true,
  registered_at: "2026-10-02T13:00:00+00:00",
  received_at: "2026-10-03T00:40:00+00:00",
};

describe("크리에이터 승인 요청 응답", () => {
  it("열린 요청 → 승인 요청 모양. 시각은 ISO(Z)", () => {
    expect(parseApprovalRequestRows([waiting])).toEqual([
      {
        orderNo: "FC-L5T6B",
        fanNickname: "달토끼",
        itemKind: "게임 패드와 간식",
        boxCount: 2,
        hasElectronicsOrMetal: true,
        registeredAt: "2026-10-02T13:00:00.000Z",
        receivedAt: "2026-10-03T00:40:00.000Z",
      },
    ]);
  });

  it("팬 송장번호 같은 다른 칸이 섞여 와도 승인 요청 모양에 넣지 않는다", () => {
    const [view] = parseApprovalRequestRows([{ ...waiting, fan_tracking_no: "441209875533" }]);
    expect(JSON.stringify(view)).not.toContain("441209875533");
  });

  it("처리한 요청: 승인·받지 않음·자동 반려를 화면 말로", () => {
    const rows = [
      { order_no: "FC-A1B2C", fan_nickname: "솜사탕", item_kind: "엽서", box_count: 1, outcome: "approved", decided_at: "2026-09-25T04:30:00+00:00" },
      { order_no: "FC-H8J2W", fan_nickname: "별빛", item_kind: "향초", box_count: 1, outcome: "declined", decided_at: "2026-09-29T05:00:00+00:00" },
      { order_no: "FC-X", fan_nickname: "하늘", item_kind: "컵", box_count: 1, outcome: "expired", decided_at: "2026-09-30T05:00:00+00:00" },
    ];
    expect(parseDecidedRequestRows(rows).map((d) => d.outcome)).toEqual(["approved", "declined", "expired"]);
  });

  it("형식이 다르면 받지 않는다 — 열린 요청이 처리 목록에 섞이는 것도", () => {
    expect(() => parseApprovalRequestRows([{ ...waiting, box_count: "2" }])).toThrow();
    expect(() =>
      parseDecidedRequestRows([{ order_no: "FC-1", fan_nickname: "a", item_kind: "b", box_count: 1, outcome: "waiting", decided_at: null }]),
    ).toThrow();
  });
});
