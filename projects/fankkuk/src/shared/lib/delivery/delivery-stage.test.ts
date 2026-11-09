import { describe, expect, it } from "vitest";
import { DELIVERY_ESTIMATED_ARRIVAL_DAYS, DELIVERY_ON_THE_WAY_AFTER_DAYS, DELIVERY_STAGE_LABEL } from "@/shared/config/delivery-status";
import { deliveryStage, isEstimatedStage } from "./delivery-stage";

// delivery-status INV-DS1(단계와 시각 경계) · INV-DS2(받는 쪽 확인이 이긴다) · INV-DS4(설정값 하나로 웹훅 전환).
// 경계는 서울 날짜로 센다 — 출고 11월 9일 오후 11시 59분(서울)이면 11월 10일 0시부터 「다음 날」이다.

const SHIPPED = "2026-11-09T14:59:00Z"; // 서울 11월 9일 23:59
/** 출고한 서울 날짜에서 n일 뒤 0시(서울) + 분 */
const seoulMidnightPlus = (days: number, minutes = 0) => new Date(Date.parse("2026-11-09T15:00:00Z") + (days - 1) * 86_400_000 + minutes * 60_000).toISOString();
const base = { printed: true, shippedAt: SHIPPED, confirmed: false } as const;

describe("deliveryStage — 웹훅 연결 전 (INV-DS1)", () => {
  it("INV-DS1: 송장도 출고도 없으면 단계가 없다, 송장만 출력했으면 「팬꾹에서 보냈어요」", () => {
    expect(deliveryStage({ printed: false, shippedAt: null, confirmed: false }, SHIPPED, "estimate")).toBeNull();
    expect(deliveryStage({ printed: true, shippedAt: null, confirmed: false }, SHIPPED, "estimate")).toBe("sent");
  });

  it("INV-DS1 (경계): 출고한 날 끝까지는 「팬꾹에서 보냈어요」, 다음 날 0시부터 「보통 1~2일 안에 도착해요」", () => {
    expect(DELIVERY_ON_THE_WAY_AFTER_DAYS).toBe(1);
    expect(deliveryStage(base, seoulMidnightPlus(DELIVERY_ON_THE_WAY_AFTER_DAYS, -1), "estimate")).toBe("sent");
    expect(deliveryStage(base, seoulMidnightPlus(DELIVERY_ON_THE_WAY_AFTER_DAYS), "estimate")).toBe("on_the_way");
  });

  it("INV-DS1 (경계): 확인이 없으면 출고 + 3일 0시부터 「도착했어요(예상)」, 그 1분 전까지는 「보통 1~2일 안에 도착해요」", () => {
    expect(DELIVERY_ESTIMATED_ARRIVAL_DAYS).toBe(3);
    expect(deliveryStage(base, seoulMidnightPlus(DELIVERY_ESTIMATED_ARRIVAL_DAYS, -1), "estimate")).toBe("on_the_way");
    expect(deliveryStage(base, seoulMidnightPlus(DELIVERY_ESTIMATED_ARRIVAL_DAYS), "estimate")).toBe("arrived_estimated");
    expect(isEstimatedStage("arrived_estimated")).toBe(true);
    expect(isEstimatedStage("arrived")).toBe(false);
  });

  it("INV-DS1: 서울 날짜(YYYY-MM-DD)로 받은 출고 날도 같은 경계", () => {
    const day = { ...base, shippedAt: "2026-11-09" };
    expect(deliveryStage(day, seoulMidnightPlus(1, -1), "estimate")).toBe("sent");
    expect(deliveryStage(day, seoulMidnightPlus(1), "estimate")).toBe("on_the_way");
    expect(deliveryStage(day, seoulMidnightPlus(3), "estimate")).toBe("arrived_estimated");
  });

  it("INV-DS1: 단계 문구는 결정문 그대로", () => {
    expect(DELIVERY_STAGE_LABEL).toEqual({ sent: "팬꾹에서 보냈어요", on_the_way: "보통 1~2일 안에 도착해요", arrived: "도착했어요", arrived_estimated: "도착했어요(예상)" });
  });
});

describe("deliveryStage — 받는 쪽 확인 (INV-DS2)", () => {
  it("INV-DS2: [받았어요]가 있으면 출고한 날에도, 3일 뒤에도 「도착했어요」(예상이 아님)", () => {
    expect(deliveryStage({ ...base, confirmed: true }, seoulMidnightPlus(0, 1), "estimate")).toBe("arrived");
    expect(deliveryStage({ ...base, confirmed: true }, seoulMidnightPlus(5), "estimate")).toBe("arrived");
  });
  it("INV-DS2 (실패경로): 확인이 없으면 몇 날이 지나도 확정 「도착했어요」가 되지 않는다", () => {
    expect(deliveryStage(base, seoulMidnightPlus(30), "estimate")).toBe("arrived_estimated");
  });
});

describe("deliveryStage — 웹훅 자리 (INV-DS4)", () => {
  it("INV-DS4: webhook 이면 날짜가 아니라 택배사 상태로 — 상태가 없으면 며칠이 지나도 「팬꾹에서 보냈어요」, 예상 도착은 없다", () => {
    expect(deliveryStage(base, seoulMidnightPlus(5), "webhook")).toBe("sent");
    expect(deliveryStage({ ...base, carrier: "picked_up" }, seoulMidnightPlus(0, 1), "webhook")).toBe("on_the_way");
    expect(deliveryStage({ ...base, carrier: "in_transit" }, seoulMidnightPlus(0, 1), "webhook")).toBe("on_the_way");
    expect(deliveryStage({ ...base, carrier: "delivered" }, seoulMidnightPlus(0, 1), "webhook")).toBe("arrived");
  });
  it("INV-DS4 (실패경로): estimate 에서는 택배사 상태 칸이 와도 쓰지 않는다", () => {
    expect(deliveryStage({ ...base, carrier: "delivered" }, seoulMidnightPlus(1), "estimate")).toBe("on_the_way");
  });
});
