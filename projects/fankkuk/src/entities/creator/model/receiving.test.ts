import { describe, expect, it } from "vitest";
import {
  anniversaryInWeek,
  daysUntil,
  ddayLabel,
  isResting,
  kstToday,
  limitReachedMessage,
  nextMonthFirst,
  restingMessage,
  restingNotice,
  upcomingDday,
  resumeRange,
  daysInMonth,
} from "./receiving";

// 크리에이터 받는 양 조절 — 화면 쪽 계산 (docs/specs/creator-receiving.md INV-B2·B6·B8·B9).
// 크리에이터 페이지와 등록 화면이 이 함수들을 같이 쓴다(INV-B8 「계산 함수 하나」).

const d = (year: number, month: number, day: number) => ({ year, month, day });

describe("INV-B8: D-day 는 가장 가까운 생일·기념일 하나를 D-30 ~ D-day 동안", () => {
  const birthday = { month: 3, day: 10 };

  it("INV-B8 S8: 생일 3월 10일, 평년 — 2월 7일 안 보임 · 2월 8일 D-30 · 3월 10일 D-day · 3월 11일 안 보임", () => {
    expect(upcomingDday(d(2027, 2, 7), birthday, [])).toBeNull();
    expect(upcomingDday(d(2027, 2, 8), birthday, [])).toEqual({ kind: "birthday", name: "생일", daysLeft: 30 });
    expect(upcomingDday(d(2027, 3, 10), birthday, [])).toEqual({ kind: "birthday", name: "생일", daysLeft: 0 });
    expect(upcomingDday(d(2027, 3, 11), birthday, [])).toBeNull();
  });

  it("INV-B8 S8b: 기념일 2월 29일은 평년 2월 28일에 D-day, 윤년에는 2월 29일에 D-day", () => {
    const leapDay = [{ name: "데뷔일", month: 2, day: 29 }];
    expect(upcomingDday(d(2027, 2, 28), null, leapDay)).toEqual({ kind: "anniversary", name: "데뷔일", daysLeft: 0 });
    expect(upcomingDday(d(2028, 2, 28), null, leapDay)).toEqual({ kind: "anniversary", name: "데뷔일", daysLeft: 1 });
    expect(daysUntil(d(2027, 3, 1), { month: 2, day: 29 })).toBe(365); // 다음 해 2028 은 윤년 — 2월 29일
  });

  it("INV-B8: 해를 넘는 날 — 12월 20일에 1월 5일 기념일은 D-16", () => {
    expect(upcomingDday(d(2026, 12, 20), null, [{ name: "데뷔일", month: 1, day: 5 }])?.daysLeft).toBe(16);
  });

  it("INV-B8: 가장 가까운 하나만 — 생일보다 기념일이 가까우면 기념일", () => {
    const r = upcomingDday(d(2027, 3, 1), birthday, [{ name: "데뷔일", month: 3, day: 5 }, { name: "팬카페", month: 3, day: 3 }]);
    expect(r).toEqual({ kind: "anniversary", name: "팬카페", daysLeft: 2 });
  });

  it("INV-B8: 같은 날이 둘이면 생일 먼저, 그다음 등록 순서", () => {
    expect(upcomingDday(d(2027, 3, 1), birthday, [{ name: "데뷔일", month: 3, day: 10 }])?.kind).toBe("birthday");
    expect(upcomingDday(d(2027, 3, 1), null, [{ name: "첫째", month: 3, day: 10 }, { name: "둘째", month: 3, day: 10 }])?.name).toBe("첫째");
  });

  it("INV-B8: 아무것도 없으면 null, 표시 문구는 「생일 D-12」·「데뷔일 D-day」", () => {
    expect(upcomingDday(d(2027, 3, 1), null, [])).toBeNull();
    expect(ddayLabel({ kind: "birthday", name: "생일", daysLeft: 12 })).toBe("생일 D-12");
    expect(ddayLabel({ kind: "anniversary", name: "데뷔일", daysLeft: 0 })).toBe("데뷔일 D-day");
  });

  it("INV-B8: 오늘은 한국 시간 날짜 — UTC 10월 9일 15시는 한국 10월 10일 0시", () => {
    expect(kstToday(new Date("2026-10-09T15:00:00Z"))).toEqual(d(2026, 10, 10));
    expect(kstToday(new Date("2026-10-09T14:59:59Z"))).toEqual(d(2026, 10, 9));
  });
});

describe("INV-B9: 기념일 7일 안(D-7 ~ D-day)이면 「{기념일} 선물」을 고를 수 있다", () => {
  const debut = [{ name: "데뷔일", month: 10, day: 15 }];

  it("INV-B9 S9: 5일 뒤 데뷔일은 고를 수 있고, D-7·D-day 도 된다", () => {
    expect(anniversaryInWeek(d(2026, 10, 10), debut)).toBe("데뷔일");
    expect(anniversaryInWeek(d(2026, 10, 8), debut)).toBe("데뷔일");
    expect(anniversaryInWeek(d(2026, 10, 15), debut)).toBe("데뷔일");
  });

  it("INV-B9 S9b (실패경로): 8일 뒤·지난 날은 고를 수 없다", () => {
    expect(anniversaryInWeek(d(2026, 10, 7), debut)).toBeNull();
    expect(anniversaryInWeek(d(2026, 10, 16), debut)).toBeNull();
  });

  it("INV-B9: 생일은 기념일 표시 대상이 아니다 — 기념일만 본다, 둘이면 가까운 쪽", () => {
    expect(anniversaryInWeek(d(2026, 10, 10), [])).toBeNull();
    expect(anniversaryInWeek(d(2026, 10, 10), [{ name: "먼날", month: 10, day: 16 }, { name: "가까운날", month: 10, day: 12 }])).toBe("가까운날");
  });
});

describe("INV-B2: 쉬는 중 판정과 문구", () => {
  it("INV-B2: 다시 받는 날이 오늘보다 뒤면 쉬는 중, 오늘이거나 지났거나 없으면 받는 중", () => {
    const today = d(2026, 10, 10);
    expect(isResting("2026-10-11", today)).toBe(true);
    expect(isResting("2026-10-10", today)).toBe(false);
    expect(isResting("2026-10-01", today)).toBe(false);
    expect(isResting(null, today)).toBe(false);
  });

  it("INV-B2: 문구는 「잠시 선물 받기를 쉬고 있어요. 10월 20일부터 다시 받을게요」", () => {
    expect(restingMessage("2026-10-20")).toBe("잠시 선물 받기를 쉬고 있어요. 10월 20일부터 다시 받을게요");
  });
});

describe("INV-B2: 쉬는 중 안내 하나 — 크리에이터 페이지·등록 화면 목록·고른 크리에이터 안내가 같이 쓴다", () => {
  const today = d(2026, 10, 10);
  it("INV-B2: 다시 받는 날이 오늘보다 뒤면 문구", () => {
    expect(restingNotice("2026-10-20", today)).toBe("잠시 선물 받기를 쉬고 있어요. 10월 20일부터 다시 받을게요");
    expect(restingNotice("2026-10-11", today)).toBe("잠시 선물 받기를 쉬고 있어요. 10월 11일부터 다시 받을게요");
  });
  it("INV-B2 S2c (실패경로): 오늘·지난 날·없음은 null", () => {
    expect(restingNotice("2026-10-10", today)).toBeNull();
    expect(restingNotice("2026-10-01", today)).toBeNull();
    expect(restingNotice(null, today)).toBeNull();
  });
});

describe("INV-B6: 한도에 닿은 팬에게 보이는 문구 하나", () => {
  it("INV-B6 S6b: 다음 달 1일 — 10월 10일이면 11월 1일, 12월 31일이면 다음 해 1월 1일", () => {
    expect(nextMonthFirst(d(2026, 10, 10))).toEqual(d(2026, 11, 1));
    expect(nextMonthFirst(d(2026, 12, 31))).toEqual(d(2027, 1, 1));
  });

  it("INV-B6 S6b: 문구는 「이번 달 선물 한도에 도달했습니다. 11월 1일부터 다시 보낼 수 있습니다.」 — 숫자(한도·남은 개수)가 없다", () => {
    const text = limitReachedMessage(d(2026, 10, 10));
    expect(text).toBe("이번 달 선물 한도에 도달했습니다. 11월 1일부터 다시 보낼 수 있습니다.");
    expect(limitReachedMessage(d(2026, 12, 3))).toBe("이번 달 선물 한도에 도달했습니다. 1월 1일부터 다시 보낼 수 있습니다.");
  });
});

describe("INV-B3: 다시 받는 날 범위(내일 ~ 365일 뒤)", () => {
  it("INV-B3: 2026-10-10 이면 2026-10-11 ~ 2027-10-10", () => {
    expect(resumeRange(d(2026, 10, 10))).toEqual({ min: "2026-10-11", max: "2027-10-10" });
  });
  it("INV-B7: 달마다 고를 수 있는 마지막 날 — 2월은 29일, 4월은 30일", () => {
    expect([daysInMonth(2), daysInMonth(4), daysInMonth(12)]).toEqual([29, 30, 31]);
  });
});
