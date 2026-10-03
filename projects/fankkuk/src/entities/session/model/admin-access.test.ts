import { describe, expect, it } from "vitest";
import { adminAccessOf } from "./admin-access";

describe("관리자 화면 접근 판정", () => {
  it("INV-K1 S1c (실패경로): 운영자가 아니면 404 — 팬·크리에이터·손님 모두 is_operator 가 false 다", () => {
    expect(adminAccessOf({ operator: false, owner: false })).toBe("not_found");
  });

  it("INV-K1 S1c (실패경로): 운영자 확인이 안 되면(오류·손님이라 묻지 못함) 404 로 닫는다", () => {
    expect(adminAccessOf({ operator: null, owner: null })).toBe("not_found");
    expect(adminAccessOf({ operator: null, owner: true })).toBe("not_found");
  });

  it("INV-K1 (실패경로): 대표 설정 표에만 있고 운영자가 아닌 계정도 404 — 대표 판정만으로는 들어오지 못한다", () => {
    expect(adminAccessOf({ operator: false, owner: true })).toBe("not_found");
  });

  it("INV-K2: 운영자이면서 대표면 대표, 대표가 아니거나 대표 확인이 안 되면 직원(요금 수정 없음)", () => {
    expect(adminAccessOf({ operator: true, owner: true })).toBe("owner");
    expect(adminAccessOf({ operator: true, owner: false })).toBe("staff");
    expect(adminAccessOf({ operator: true, owner: null })).toBe("staff");
  });
});
