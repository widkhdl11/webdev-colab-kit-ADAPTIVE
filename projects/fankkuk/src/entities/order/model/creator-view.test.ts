import { describe, expect, it } from "vitest";
import type { OrderRecord } from "./order-record";
import { pendingApprovalRequests } from "./creator-view";

const base: OrderRecord = {
  orderNo: "FC-7K3M9",
  creatorId: "c1",
  creatorName: "하루",
  fanNickname: "별빛",
  itemKind: "인형",
  boxCount: 2,
  hasElectronicsOrMetal: true,
  status: "registered",
  registeredAt: "2026-10-01T01:00:00.000Z",
  approvedAt: null,
  receivedAt: null,
  inspection: null,
  shippedAt: null,
  expectedArrivalDate: null,
  delivery: null,
  outboundWaybillNo: null,
  fanTrackingNo: "987654321098",
  fanSendAckAt: null,
};

describe("pendingApprovalRequests — 크리에이터 승인 요청 목록", () => {
  it("그 크리에이터의 승인 대기 주문만 나온다", () => {
    const list = pendingApprovalRequests(
      [
        base,
        { ...base, orderNo: "FC-AAA1", creatorId: "c2" },
        { ...base, orderNo: "FC-AAA2", status: "approved", approvedAt: "2026-10-01T02:00:00.000Z" },
      ],
      "c1",
    );
    expect(list.map((r) => r.orderNo)).toEqual(["FC-7K3M9"]);
  });

  it("INV-S6: 거절·반려·취소된 주문은 승인 요청에 나오지 않는다", () => {
    const list = pendingApprovalRequests(
      (["rejected", "expired", "canceled"] as const).map((status, i) => ({ ...base, orderNo: `FC-BBB${i}`, status })),
      "c1",
    );
    expect(list).toEqual([]);
  });

  it("승인 전에 먼저 입고된 주문도 승인 요청에 나오고, 도착 시각이 보인다", () => {
    const list = pendingApprovalRequests([{ ...base, status: "received", receivedAt: "2026-10-02T01:00:00.000Z" }], "c1");
    expect(list[0]?.receivedAt).toBe("2026-10-02T01:00:00.000Z");
  });

  it("크리에이터 요청에는 요청 식별값·팬 닉네임·물품 종류·상자 수·전자기기 신고만 있고 팬의 송장번호는 없다", () => {
    const [req] = pendingApprovalRequests([base], "c1");
    expect(req).toEqual({
      requestId: "apr_FC7K3M9",
      orderNo: "FC-7K3M9",
      fanNickname: "별빛",
      itemKind: "인형",
      boxCount: 2,
      hasElectronicsOrMetal: true,
      registeredAt: "2026-10-01T01:00:00.000Z",
      receivedAt: null,
      priorHistory: { gifts: 0, passed: 0, returned: 0 },
    });
  });

  it("INV-D11: 예시 기록의 지난 내역은 같은 크리에이터·같은 팬 주문만, 자기 주문은 빼고 센다", () => {
    const passed = { ...base, orderNo: "FC-OLD01", status: "shipped" as const, approvedAt: "2026-09-01T00:00:00.000Z", inspection: { result: "passed" as const, at: "2026-09-02T00:00:00.000Z" } };
    const returned = { ...passed, orderNo: "FC-OLD02", status: "rejected" as const, inspection: { result: "returned" as const, at: "2026-09-02T00:00:00.000Z" } };
    const otherCreator = { ...returned, orderNo: "FC-OLD03", creatorId: "c2" };
    const otherFan = { ...returned, orderNo: "FC-OLD04", fanNickname: "달토끼" };
    const [req] = pendingApprovalRequests([base, passed, returned, otherCreator, otherFan], "c1");
    expect(req?.priorHistory).toEqual({ gifts: 2, passed: 1, returned: 1 });
  });

  it("오래 기다린 요청이 먼저 온다", () => {
    const list = pendingApprovalRequests(
      [
        { ...base, orderNo: "FC-NEW1", registeredAt: "2026-10-03T00:00:00.000Z" },
        { ...base, orderNo: "FC-OLD1", registeredAt: "2026-10-01T00:00:00.000Z" },
      ],
      "c1",
    );
    expect(list.map((r) => r.orderNo)).toEqual(["FC-OLD1", "FC-NEW1"]);
  });
  it("검수에서 반송된 주문은 승인 전이어도 승인 요청에 나오지 않는다 — 팬 화면은 이미 끝난 주문으로 본다", () => {
    const returned = { ...base, status: "inspected" as const, receivedAt: "2026-10-02T01:00:00.000Z", inspection: { result: "returned" as const, at: "2026-10-02T02:00:00.000Z" } };
    const passed = { ...returned, orderNo: "FC-PASS1", inspection: { result: "passed" as const, at: "2026-10-02T02:00:00.000Z" } };
    expect(pendingApprovalRequests([returned, passed], "c1").map((r) => r.orderNo)).toEqual(["FC-PASS1"]);
  });
});
