import { describe, expect, it } from "vitest";
import type { OfficeParcel } from "@/entities/parcel/model/office-parcel";
import { countByParcelTab, filterParcels } from "./parcel-filter";

const base: OfficeParcel = {
  qr: "Q-000001",
  kind: "gift",
  orderNo: "FC-261003-0041",
  senderNickname: "별빛",
  receiverName: "하루",
  tier: "small",
  state: "labeled",
  receivedAt: null,
  nextStep: "inspect",
};
const rows: OfficeParcel[] = [
  base,
  { ...base, orderNo: "FC-2", state: "awaiting", nextStep: "scan_inbound" },
  { ...base, orderNo: "RG-3", kind: "revgift", senderNickname: "모카", state: "inspected", nextStep: "wait_accept" },
  { ...base, orderNo: "FC-4", state: "return_waiting", nextStep: "print_return" },
];

describe("들어온 상자 탭·검색 (office-workflow INV-W1·W7)", () => {
  it("INV-W1: 탭은 상태로 거르고 건수를 센다", () => {
    expect(filterParcels(rows, "inspect", "").map((r) => r.orderNo)).toEqual(["FC-261003-0041"]);
    expect(filterParcels(rows, "outbound", "").map((r) => r.orderNo)).toEqual(["RG-3"]);
    expect(countByParcelTab(rows)).toEqual({ all: 4, inbound: 1, inspect: 1, outbound: 1, shipped: 0, return: 1 });
  });

  it("INV-W4: 추적기 상자도 바로 반송 대기로 가므로 「보관」 탭은 없다 — 반송 탭에 모인다 (2026-10-12 D2)", async () => {
    const { PARCEL_TABS } = await import("./parcel-filter");
    expect(PARCEL_TABS.map((t) => t.key)).toEqual(["all", "inbound", "inspect", "outbound", "shipped", "return"]);
    expect(PARCEL_TABS.map((t) => t.label)).not.toContain("보관");
  });

  it("INV-W7: 검색은 주문번호·닉네임·이름으로만 — 대소문자 무시", () => {
    expect(filterParcels(rows, "all", "rg-").map((r) => r.orderNo)).toEqual(["RG-3"]);
    expect(filterParcels(rows, "all", "모카").map((r) => r.orderNo)).toEqual(["RG-3"]);
    expect(filterParcels(rows, "all", "없는사람")).toEqual([]);
  });
});
