import { describe, expect, it } from "vitest";
import { monthLabelOf, printLabelOf, seoulMonthKey } from "./access-log";

describe("printLabelOf — 열람 기록 줄의 출력 라벨 (INV-P5)", () => {
  it("1번째는 첫 출력", () => {
    expect(printLabelOf(1)).toEqual({ reprint: false, text: "첫 출력" });
  });

  it("2번째부터 재출력, 몇 번째인지 붙인다", () => {
    expect(printLabelOf(2)).toEqual({ reprint: true, text: "재출력 2번째" });
    expect(printLabelOf(3)).toEqual({ reprint: true, text: "재출력 3번째" });
  });
});

describe("서울 기준 달", () => {
  it("UTC 로는 9월 30일 밤이어도 서울로 10월 1일이면 10월이다", () => {
    expect(seoulMonthKey("2026-09-30T15:30:00.000Z")).toBe("2026-10");
    expect(seoulMonthKey("2026-09-30T14:59:00.000Z")).toBe("2026-09");
  });

  it("달 이름은 「2026년 10월」", () => {
    expect(monthLabelOf("2026-10")).toBe("2026년 10월");
    expect(monthLabelOf("2026-09")).toBe("2026년 9월");
  });
});
