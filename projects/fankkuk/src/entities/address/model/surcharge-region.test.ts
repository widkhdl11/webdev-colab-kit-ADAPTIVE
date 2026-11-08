import { describe, expect, it } from "vitest";
import { ISLAND_ZIP_RANGES, JEJU_ZIP_RANGE, parseSurchargeRegion, SURCHARGE_REGIONS, surchargeRegionOf } from "./surcharge-region";

// 할증 지역 구분 (address-protection INV-P20 ②③). 브라우저(주소 저장)와 송장 출력 함수(재판정)가 같은 함수를 쓴다.
// 경계 값은 숫자로 적지 않고 설정표에서 읽는다(.claude/rules/tdd.md).

const zip = (n: number) => String(n).padStart(5, "0");

describe("INV-P20: 우편번호 → 할증 구분", () => {
  it("INV-P20 S20: 제주 우편번호(63309)는 「제주」", () => {
    expect(surchargeRegionOf("63309")).toBe("jeju");
  });

  it("INV-P20: 제주 범위의 양 끝은 제주, 바로 바깥은 할증 없음", () => {
    expect(surchargeRegionOf(zip(JEJU_ZIP_RANGE.from))).toBe("jeju");
    expect(surchargeRegionOf(zip(JEJU_ZIP_RANGE.to))).toBe("jeju");
    expect(surchargeRegionOf(zip(JEJU_ZIP_RANGE.from - 1))).toBe("none");
    expect(surchargeRegionOf(zip(JEJU_ZIP_RANGE.to + 1))).toBe("none");
  });

  it("INV-P20: 도서 범위에 든 우편번호는 「도서」 — 범위표를 넘겨 판정한다", () => {
    const islands = [{ from: 23100, to: 23136 }];
    expect(surchargeRegionOf("23100", islands)).toBe("island");
    expect(surchargeRegionOf("23136", islands)).toBe("island");
    expect(surchargeRegionOf("23137", islands)).toBe("none");
    expect(surchargeRegionOf("63309", islands)).toBe("jeju");
  });

  it("INV-P20: 기본 도서 범위표는 지금 비어 있다(택배사 목록을 받기 전) — 아무 번호도 「도서」가 아니다", () => {
    expect(ISLAND_ZIP_RANGES).toEqual([]);
    expect(surchargeRegionOf("23100")).toBe("none");
  });

  it("INV-P20 (실패경로): 다섯 자리 숫자가 아니면 판정하지 않는다(null)", () => {
    for (const bad of ["6330", "633090", "63a09", "", " 63309"]) expect(surchargeRegionOf(bad)).toBeNull();
  });

  it("INV-P20 (실패경로): 구분 값은 세 가지만 받는다", () => {
    expect(SURCHARGE_REGIONS).toEqual(["none", "jeju", "island"]);
    for (const ok of SURCHARGE_REGIONS) expect(parseSurchargeRegion(ok)).toBe(ok);
    for (const bad of ["JEJU", "63309", "", null, undefined, 1]) expect(parseSurchargeRegion(bad)).toBeNull();
  });
});
