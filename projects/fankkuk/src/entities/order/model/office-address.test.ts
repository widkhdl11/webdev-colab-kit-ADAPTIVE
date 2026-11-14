import { describe, expect, it } from "vitest";
import { normalizeOfficeAddress, OFFICE_ADDRESS_MAX, OFFICE_ADDRESS_MIN, officeAddressProblem } from "./office-address";

describe("팬꾹 주소 값 검사 (admin-console INV-K19 ②)", () => {
  it("INV-K19 (S19c): 앞뒤 공백을 빼고 센다 — 경계 값은 통과", () => {
    expect(officeAddressProblem(`  ${"가".repeat(OFFICE_ADDRESS_MIN)}  `)).toBeNull();
    expect(officeAddressProblem("가".repeat(OFFICE_ADDRESS_MAX))).toBeNull();
    expect(normalizeOfficeAddress("  서울특별시 강남구  ")).toBe("서울특별시 강남구");
  });

  it("INV-K19 (S19c, 실패경로): 공백뿐·하나 모자람·하나 넘침은 length", () => {
    expect(officeAddressProblem("     ")).toBe("length");
    expect(officeAddressProblem("가".repeat(OFFICE_ADDRESS_MIN - 1))).toBe("length");
    expect(officeAddressProblem("가".repeat(OFFICE_ADDRESS_MAX + 1))).toBe("length");
  });

  it.each([
    ["줄바꿈", "\n"],
    ["탭", "\t"],
    ["C1 제어 문자", "\u0085"],
    ["줄 구분 문자", "\u2028"],
    ["오른쪽에서 왼쪽 덮어쓰기", "\u202E"],
    ["폭 없는 공백", "\u200B"],
  ])("INV-K19 (S19c, 실패경로): 가운데의 %s 는 control", (_label, ch) => {
    expect(officeAddressProblem(`서울특별시 강남구${ch}4층`)).toBe("control");
  });

  it("INV-K19 (S19c): 앞뒤의 전각 공백·NBSP 는 잘라 내고 통과", () => {
    expect(normalizeOfficeAddress("\u3000서울특별시 강남구\u00A0")).toBe("서울특별시 강남구");
    expect(officeAddressProblem("\u3000서울특별시 강남구\u00A0")).toBeNull();
  });
});
