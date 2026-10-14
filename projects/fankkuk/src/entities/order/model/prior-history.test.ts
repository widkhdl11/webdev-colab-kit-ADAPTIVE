import { describe, expect, it } from "vitest";
import { priorHistoryLabel } from "./prior-history";

// 승인 요청 카드의 지난 검수 내역 문구(decline-block INV-D11, 카드 d80). 세는 것은 DB 가 한다 — 여기는 수를 사실대로 말로 옮기는 것만.
describe("priorHistoryLabel — 지난 검수 내역 한 줄 (INV-D11)", () => {
  it("INV-D11: 지난 주문이 없으면 처음이라고만", () => {
    expect(priorHistoryLabel({ gifts: 0, passed: 0, returned: 0 })).toBe("처음 보내는 팬이에요");
  });
  it("INV-D11: 모두 통과면 「모두 검수 통과」", () => {
    expect(priorHistoryLabel({ gifts: 3, passed: 3, returned: 0 })).toBe("지난 선물 3건 · 모두 검수 통과");
  });
  it("INV-D11: 반송이 있으면 그 수를 사실대로 — 통과·반송을 따로", () => {
    expect(priorHistoryLabel({ gifts: 3, passed: 2, returned: 1 })).toBe("지난 선물 3건 · 검수 통과 2건 · 검수 반송 1건");
    expect(priorHistoryLabel({ gifts: 1, passed: 0, returned: 1 })).toBe("지난 선물 1건 · 검수 반송 1건");
  });
  it("INV-D11: 검수 결과가 없는 지난 주문(검수 전·검수 전에 끝남)은 따로 센다 — 처음이라고 하지 않는다", () => {
    expect(priorHistoryLabel({ gifts: 2, passed: 0, returned: 0 })).toBe("지난 선물 2건 · 검수 결과 없음 2건");
    expect(priorHistoryLabel({ gifts: 4, passed: 2, returned: 0 })).toBe("지난 선물 4건 · 검수 통과 2건 · 검수 결과 없음 2건");
  });
  it("경고·점수 말은 쓰지 않는다 — 판단은 크리에이터가 한다", () => {
    for (const h of [{ gifts: 5, passed: 0, returned: 5 }, { gifts: 0, passed: 0, returned: 0 }]) {
      expect(priorHistoryLabel(h)).not.toMatch(/주의|위험|경고|점|공식|인증된|검증된|안전한/);
    }
  });
});
