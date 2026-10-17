import { describe, expect, it } from "vitest";
import type { OrderRecord } from "./order-record";
import { toFanView } from "./fan-view";

const OFFICE = "서울 강남구 예시로 1, 팬꾹 사무실";

const base: OrderRecord = {
  orderNo: "FC-7K3M9",
  creatorId: "c1",
  creatorName: "하루",
  fanNickname: "별빛",
  itemKind: "인형",
  boxCount: 1,
  hasElectronicsOrMetal: false,
  status: "registered",
  registeredAt: "2026-10-01T01:00:00.000Z",
  approvedAt: null,
  receivedAt: null,
  inspection: null,
  shippedAt: null,
  expectedArrivalDate: null,
  delivery: null,
  outboundWaybillNo: null,
  fanTrackingNo: null,
  fanSendAckAt: null,
};

const shipped: OrderRecord = {
  ...base,
  status: "shipped",
  approvedAt: "2026-10-01T03:00:00.000Z",
  receivedAt: "2026-10-02T01:00:00.000Z",
  inspection: { result: "passed", at: "2026-10-02T02:00:00.000Z" },
  shippedAt: "2026-10-02T06:00:00.000Z",
  expectedArrivalDate: "2026-10-04",
  delivery: "in_transit",
  outboundWaybillNo: "123456789012",
  fanTrackingNo: "987654321098",
  fanSendAckAt: null,
};

describe("toFanView — 팬에게 보이는 것", () => {
  it("INV-S9 (S9): 결제가 끝난 주문은 승인 전이라도 사무실 주소가 나온다 — 승인을 기다리지 않고 보낸다", () => {
    expect(toFanView(base, OFFICE).officeAddress).toBe(OFFICE);
  });

  it("INV-S9 (S9): 승인 전·「먼저 보내기」 전인 진행 중 주문은 earlySendPending — 누르거나 승인되면 아니다", () => {
    expect(toFanView(base, OFFICE).earlySendPending).toBe(true);
    expect(toFanView({ ...base, fanSendAckAt: "2026-10-01T02:00:00.000Z" }, OFFICE).earlySendPending).toBe(false);
    expect(toFanView({ ...base, approvedAt: "2026-10-01T03:00:00.000Z" }, OFFICE).earlySendPending).toBe(false);
    expect(toFanView({ ...base, status: "rejected" }, OFFICE).earlySendPending).toBe(false);
  });

  it("INV-S9: 승인된 주문도 사무실 주소가 나온다", () => {
    const view = toFanView({ ...base, status: "approved", approvedAt: "2026-10-01T03:00:00.000Z" }, OFFICE);
    expect(view.officeAddress).toBe(OFFICE);
  });

  it("INV-S9 (S9b, 실패경로): 승인 전 거절·반려·취소된 주문에는 사무실 주소가 없다", () => {
    for (const status of ["rejected", "expired", "canceled"] as const) {
      expect(toFanView({ ...base, status }, OFFICE).officeAddress).toBeNull();
    }
  });

  it("INV-S9 (S9b, 실패경로): 검수에서 반송된 주문에는 사무실 주소가 없다", () => {
    const view = toFanView(
      { ...base, status: "received", receivedAt: "2026-10-02T01:00:00.000Z", inspection: { result: "returned", at: "2026-10-02T02:00:00.000Z" } },
      OFFICE,
    );
    expect(view.officeAddress).toBeNull();
  });

  it("INV-S9 (S9b, 실패경로): 승인 기록이 있어도 거절·반려·취소된 주문에는 사무실 주소가 없다", () => {
    for (const status of ["rejected", "expired", "canceled"] as const) {
      const view = toFanView({ ...base, status, approvedAt: "2026-10-01T03:00:00.000Z" }, OFFICE);
      expect(view.officeAddress).toBeNull();
    }
  });

  it("크리에이터에게 보내는 송장번호는 팬 화면 어디에도 없다", () => {
    const view = toFanView(shipped, OFFICE);
    expect(JSON.stringify(view)).not.toContain("123456789012");
  });

  it("팬이 입력한 자기 송장번호는 보인다", () => {
    expect(toFanView(shipped, OFFICE).fanTrackingNo).toBe("987654321098");
  });

  it("decline-block INV-D5: 거절(직접·차단 모두 rejected)은 declined, 7일 자동 반려는 expired 로 따로 보인다", () => {
    const rejected = toFanView({ ...base, status: "rejected" }, OFFICE);
    const expired = toFanView({ ...base, status: "expired" }, OFFICE);
    expect(rejected.outcome).toBe("declined");
    expect(expired.outcome).toBe("expired");
    expect({ ...expired, outcome: "declined" }).toEqual(rejected); // 다른 것은 결과 값 하나뿐 — 이유·차단 칸이 없다
  });

  it("본 단계는 등록부터 수령까지 여섯 개이고, 승인은 단계가 아니라 따로 붙는다", () => {
    const view = toFanView(shipped, OFFICE);
    expect(view.steps.map((s) => s.key)).toEqual(["registered", "received", "inspected", "shipped", "in_transit", "delivered"]);
    expect(view.steps.map((s) => s.state)).toEqual(["done", "done", "done", "done", "done", "current"]);
    expect(view.approval).toEqual({ state: "done", at: "2026-10-01T03:00:00.000Z" });
  });

  it("결제 직후 지금 단계는 입고다 — 승인을 기다리지 않는다", () => {
    expect(toFanView(base, OFFICE).steps.find((s) => s.state === "current")?.key).toBe("received");
  });

  it("검수까지 끝나고 승인 전이면 출고가 승인을 기다린다 — 승인 칸이 waiting", () => {
    const view = toFanView(
      { ...base, status: "inspected", receivedAt: "2026-10-02T01:00:00.000Z", inspection: { result: "passed", at: "2026-10-02T02:00:00.000Z" } },
      OFFICE,
    );
    expect(view.steps.find((s) => s.state === "current")?.key).toBe("shipped");
    expect(view.approval).toEqual({ state: "waiting", at: null });
  });

  it("검수 전 승인 전이면 승인 칸은 아직 기다릴 때가 아니다 — todo", () => {
    expect(toFanView(base, OFFICE).approval).toEqual({ state: "todo", at: null });
  });

  it("입고 전에 승인되면 승인 칸은 done 이고 지금 단계는 입고다", () => {
    const view = toFanView({ ...base, status: "approved", approvedAt: "2026-10-01T03:00:00.000Z" }, OFFICE);
    expect(view.approval).toEqual({ state: "done", at: "2026-10-01T03:00:00.000Z" });
    expect(view.steps.find((s) => s.state === "current")?.key).toBe("received");
  });

  it("거절·반려된 주문은 승인 기록이 있어도 승인 칸이 done 이 아니다", () => {
    const view = toFanView({ ...base, status: "rejected", approvedAt: "2026-10-01T03:00:00.000Z" }, OFFICE);
    expect(view.approval.state).not.toBe("done");
  });

  it("검수 불합격이면 반송으로 끝나고 지금 단계가 없다", () => {
    const view = toFanView(
      { ...shipped, shippedAt: null, delivery: null, inspection: { result: "returned", at: "2026-10-02T02:00:00.000Z" } },
      OFFICE,
    );
    expect(view.outcome).toBe("returned");
    expect(view.steps.some((s) => s.state === "current")).toBe(false);
  });

  it("송장번호 입력은 결제 뒤 입고 전에만 열린다 — 승인 여부와 상관없다", () => {
    expect(toFanView(base, OFFICE).canEnterTrackingNo).toBe(true);
    expect(toFanView({ ...base, receivedAt: "2026-10-02T01:00:00.000Z" }, OFFICE).canEnterTrackingNo).toBe(false);
    expect(toFanView({ ...base, status: "rejected" }, OFFICE).canEnterTrackingNo).toBe(false);
  });
  it("검수 반송이면 검수 단계가 '멈춤'이고 시각이 남는다 — 어디서 멈췄는지 보인다", () => {
    const view = toFanView(
      { ...shipped, shippedAt: null, delivery: null, inspection: { result: "returned", at: "2026-10-02T02:00:00.000Z" } },
      OFFICE,
    );
    const inspected = view.steps.find((s) => s.key === "inspected");
    expect(inspected).toEqual({ key: "inspected", at: "2026-10-02T02:00:00.000Z", state: "stopped" });
    expect(view.steps.filter((s) => s.state === "stopped")).toHaveLength(1);
  });
});

describe("office-workflow INV-W14: 추적기 보관·신고 보관·경찰 인계 상자의 주문은 팬에게 「확인 중」으로만", () => {
  const received = { ...base, status: "received" as const, receivedAt: "2026-10-02T01:00:00.000Z" };
  it("INV-W14: 검수 결과가 checking 이면 진행 중이고 지금 단계는 검수, inspectionChecking 이 켜진다", () => {
    const v = toFanView({ ...received, inspection: { result: "checking", at: "2026-10-02T02:00:00.000Z" } }, OFFICE);
    expect(v.outcome).toBe("in_progress");
    expect(v.steps.find((s) => s.state === "current")?.key).toBe("inspected");
    expect(v.inspectionChecking).toBe(true);
  });
  it("INV-W14 (실패경로): 통과·반송·검수 전 주문은 inspectionChecking 이 아니다", () => {
    for (const inspection of [null, { result: "passed" as const, at: "2026-10-02T02:00:00.000Z" }, { result: "returned" as const, at: "2026-10-02T02:00:00.000Z" }]) {
      expect(toFanView({ ...received, inspection }, OFFICE).inspectionChecking).toBe(false);
    }
  });
});
