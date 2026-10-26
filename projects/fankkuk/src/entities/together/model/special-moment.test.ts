import { describe, expect, it } from "vitest";
import { SPECIAL_MOMENT_TEXT, specialMoments } from "./special-moment";

// 특별 카드 계산 (together INV-F4). 10번째·30번째 선물과, 처음 선물한 날로부터 1년이 지난 뒤 처음 보낸 선물만 특별하다.
// 연속 기록(끊기면 사라지는 것)은 없다 — 특별 카드는 순번과 날짜로만 정해진다.

/** 처음 선물한 날부터 하루씩 n 개 — 1번째가 firstOn. */
function daily(n: number, firstOn = "2026-01-01"): { giftNo: number; registeredOn: string }[] {
  const start = Date.parse(`${firstOn}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => ({ giftNo: i + 1, registeredOn: new Date(start + i * 86_400_000).toISOString().slice(0, 10) }));
}

describe("specialMoments — 10·30번째", () => {
  it("INV-F4 S4: 선물 10개면 10번째 카드만 특별하다", () => {
    const m = specialMoments(daily(10), "2026-01-01");
    expect([...m.entries()]).toEqual([[10, "tenth"]]);
  });

  it("INV-F4: 30개면 10번째와 30번째만, 나머지 순번은 특별하지 않다", () => {
    const m = specialMoments(daily(31), "2026-01-01");
    expect([...m.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [10, "tenth"],
      [30, "thirtieth"],
    ]);
  });

  it("INV-F4 (실패경로): 9개·29개에서는 특별 카드가 없다 — 20번째·40번째도 특별하지 않다", () => {
    expect(specialMoments(daily(9), "2026-01-01").size).toBe(0);
    const forty = specialMoments(daily(40), "2026-01-01");
    expect(forty.has(20)).toBe(false);
    expect(forty.has(40)).toBe(false);
  });
});

describe("specialMoments — 처음 선물한 지 1년", () => {
  const first = { giftNo: 1, registeredOn: "2025-10-04" };

  it("INV-F4: 1년이 되는 날(처음 선물한 날 + 1년) 보낸 선물은 특별하다", () => {
    const m = specialMoments([first, { giftNo: 2, registeredOn: "2026-10-04" }], "2025-10-04");
    expect(m.get(2)).toBe("first_year");
  });

  it("INV-F4 (실패경로): 1년이 되기 하루 전에 보낸 선물은 특별하지 않다 — 그다음 1년 뒤 첫 선물이 특별하다", () => {
    const m = specialMoments(
      [first, { giftNo: 2, registeredOn: "2026-10-03" }, { giftNo: 3, registeredOn: "2026-11-20" }, { giftNo: 4, registeredOn: "2026-12-01" }],
      "2025-10-04",
    );
    expect(m.has(2)).toBe(false);
    expect(m.get(3)).toBe("first_year");
    expect(m.has(4)).toBe(false);
  });

  it("INV-F4: 1년 뒤 첫 선물은 하나뿐이다 — 2년째에 다시 생기지 않는다(연속 기록 없음)", () => {
    const m = specialMoments(
      [first, { giftNo: 2, registeredOn: "2026-10-05" }, { giftNo: 3, registeredOn: "2027-10-04" }],
      "2025-10-04",
    );
    expect([...m.entries()]).toEqual([[2, "first_year"]]);
  });

  it("INV-F4: 2월 29일에 처음 보냈으면 다음 해 2월 28일이 1년이 되는 날이다", () => {
    const m = specialMoments(
      [{ giftNo: 1, registeredOn: "2024-02-29" }, { giftNo: 2, registeredOn: "2025-02-27" }, { giftNo: 3, registeredOn: "2025-02-28" }],
      "2024-02-29",
    );
    expect(m.has(2)).toBe(false);
    expect(m.get(3)).toBe("first_year");
  });

  it("INV-F4: 10번째가 1년 뒤 첫 선물이면 「1년째」 카드로 보인다(한 카드에 문구 하나)", () => {
    const gifts = daily(9, "2025-01-01").concat([{ giftNo: 10, registeredOn: "2026-03-01" }]);
    expect(specialMoments(gifts, "2025-01-01").get(10)).toBe("first_year");
  });

  it("INV-F4: 문구 — 본인 화면에만 쓰는 말", () => {
    expect(SPECIAL_MOMENT_TEXT).toEqual({ tenth: "10번째 선물", thirtieth: "30번째 선물", first_year: "첫 선물 1주년" });
  });
});
