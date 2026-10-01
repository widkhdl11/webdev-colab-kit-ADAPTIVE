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
};

describe("toFanView — 팬에게 보이는 것", () => {
  it("INV-S9: 승인 전 주문에는 사무실 주소가 없다", () => {
    expect(toFanView(base, OFFICE).officeAddress).toBeNull();
  });

  it("INV-S9: 승인 전에 상자가 먼저 입고돼도 사무실 주소는 없다", () => {
    const view = toFanView({ ...base, status: "received", receivedAt: "2026-10-02T01:00:00.000Z" }, OFFICE);
    expect(view.officeAddress).toBeNull();
  });

  it("INV-S9: 승인된 주문에만 사무실 주소가 나온다", () => {
    const view = toFanView({ ...base, status: "approved", approvedAt: "2026-10-01T03:00:00.000Z" }, OFFICE);
    expect(view.officeAddress).toBe(OFFICE);
  });

  it("INV-S9: 승인 기록이 있어도 거절·반려·취소된 주문에는 사무실 주소가 없다", () => {
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

  it("거절과 7일 자동 반려는 팬에게 같은 모습이다 — 크리에이터가 직접 거절했는지 드러나지 않는다", () => {
    const rejected = toFanView({ ...base, status: "rejected" }, OFFICE);
    const expired = toFanView({ ...base, status: "expired" }, OFFICE);
    expect(rejected.outcome).toBe("not_accepted");
    expect(expired).toEqual(rejected);
  });

  it("단계는 등록부터 수령까지 일곱 개이고, 처음 끝나지 않은 단계가 지금 단계다", () => {
    const view = toFanView(shipped, OFFICE);
    expect(view.steps.map((s) => s.key)).toEqual([
      "registered",
      "approved",
      "received",
      "inspected",
      "shipped",
      "in_transit",
      "delivered",
    ]);
    expect(view.steps.map((s) => s.state)).toEqual(["done", "done", "done", "done", "done", "done", "current"]);
  });

  it("승인 전에 입고되면 입고는 끝났어도 지금 단계는 승인이다", () => {
    const view = toFanView({ ...base, status: "received", receivedAt: "2026-10-02T01:00:00.000Z" }, OFFICE);
    expect(view.steps.find((s) => s.state === "current")?.key).toBe("approved");
    expect(view.steps.find((s) => s.key === "received")?.state).toBe("done");
  });

  it("검수 불합격이면 반송으로 끝나고 지금 단계가 없다", () => {
    const view = toFanView(
      { ...shipped, shippedAt: null, delivery: null, inspection: { result: "returned", at: "2026-10-02T02:00:00.000Z" } },
      OFFICE,
    );
    expect(view.outcome).toBe("returned");
    expect(view.steps.some((s) => s.state === "current")).toBe(false);
  });

  it("송장번호 입력은 승인 뒤, 입고 전에만 열린다", () => {
    const approved = { ...base, status: "approved" as const, approvedAt: "2026-10-01T03:00:00.000Z" };
    expect(toFanView(base, OFFICE).canEnterTrackingNo).toBe(false);
    expect(toFanView(approved, OFFICE).canEnterTrackingNo).toBe(true);
    expect(toFanView({ ...approved, receivedAt: "2026-10-02T01:00:00.000Z" }, OFFICE).canEnterTrackingNo).toBe(false);
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
