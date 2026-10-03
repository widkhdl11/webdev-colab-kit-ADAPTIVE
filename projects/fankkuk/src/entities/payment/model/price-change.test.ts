import { describe, expect, it } from "vitest";
import { priceChangesFromRows } from "./price-change";

const ROW = { at: "2026-10-03T00:30:00+00:00", changed_by_nickname: "모아", tier: "large", field: "price_krw", before_krw: 10400, after_krw: 10900 };

describe("요금 바꾼 기록 줄 (INV-K5·K8)", () => {
  it("INV-K5: 한 줄 = 시각·바꾼 사람·구간·칸·전·후", () => {
    expect(priceChangesFromRows([ROW])).toEqual([
      { at: ROW.at, byNickname: "모아", tier: "large", field: "price_krw", beforeKrw: 10400, afterKrw: 10900 },
    ]);
  });

  it("INV-K8: 줄에 다른 칸(주소·전화)이 섞여 와도 정해진 칸만 옮긴다", () => {
    const [only] = priceChangesFromRows([{ ...ROW, phone: "010-0000-0000", address: "서울" }]) ?? [];
    expect(Object.keys(only ?? {}).sort()).toEqual(["afterKrw", "at", "beforeKrw", "byNickname", "field", "tier"]);
  });

  it("실패경로: 모양이 다른 줄이 하나라도 있으면 통째로 실패(줄을 몰래 빼지 않는다)", () => {
    expect(priceChangesFromRows([ROW, { ...ROW, field: "service_fee" }])).toBeNull();
    expect(priceChangesFromRows([{ ...ROW, tier: "oversize" }])).toBeNull();
    expect(priceChangesFromRows(null)).toBeNull();
  });
});
