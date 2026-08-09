import { describe, expect, it } from "vitest";
import { dayHeading, dayKey, relativeTime } from "./datetime";

// 기준: 2026-08-05 01:00 UTC = 2026-08-05 10:00 KST
const NOW = "2026-08-05T01:00:00.000Z";

describe("dayKey", () => {
  it("실행 환경 시간대가 아니라 지정한 오프셋으로 날짜를 정한다", () => {
    // 2026-08-04 22:00 UTC 는 KST 로 이미 8월 5일 07:00
    expect(dayKey("2026-08-04T22:00:00.000Z")).toBe("2026-08-05");
    expect(dayKey("2026-08-04T22:00:00.000Z", 0)).toBe("2026-08-04");
  });

  it("KST 자정 직전·직후가 다른 날로 갈린다", () => {
    expect(dayKey("2026-08-04T14:59:00.000Z")).toBe("2026-08-04"); // 23:59 KST
    expect(dayKey("2026-08-04T15:00:00.000Z")).toBe("2026-08-05"); // 00:00 KST
  });
});

describe("dayHeading", () => {
  it("오늘·어제는 이름으로 부른다", () => {
    expect(dayHeading("2026-08-05", "2026-08-05")).toBe("오늘");
    expect(dayHeading("2026-08-04", "2026-08-05")).toBe("어제");
  });

  it("그 이전은 날짜와 요일로 쓴다", () => {
    expect(dayHeading("2026-08-03", "2026-08-05")).toBe("8월 3일 (월)");
    expect(dayHeading("2026-07-31", "2026-08-05")).toBe("7월 31일 (금)");
  });

  it("달을 건너뛰어도 '어제'를 알아본다", () => {
    expect(dayHeading("2026-07-31", "2026-08-01")).toBe("어제");
  });

  it("읽을 수 없는 키가 와도 'NaN월 NaN일 (undefined)' 를 그리지 않는다", () => {
    expect(dayHeading("", "2026-08-05")).not.toMatch(/NaN|undefined/);
  });
});

describe("relativeTime", () => {
  it("같은 날이면 경과 시간으로 쓴다", () => {
    expect(relativeTime("2026-08-05T00:59:30.000Z", NOW)).toBe("방금 전");
    expect(relativeTime("2026-08-05T00:40:00.000Z", NOW)).toBe("20분 전");
    expect(relativeTime("2026-08-04T23:00:00.000Z", NOW)).toBe("2시간 전");
  });

  it("전날 이전이면 날짜 + 오전/오후로 쓴다 (하루 단위로 훑는 화면이라)", () => {
    // 2026-08-04 05:00 UTC = 14:00 KST → 어제 오후
    expect(relativeTime("2026-08-04T05:00:00.000Z", NOW)).toBe("어제 오후");
    // 2026-08-03 23:00 UTC = 8월 4일 08:00 KST → 어제 오전
    expect(relativeTime("2026-08-03T23:00:00.000Z", NOW)).toBe("어제 오전");
    // 같은 달이면 일(日)만 — 피드에서는 위에 날짜 그룹 헤더가 맥락을 준다
    // 2026-08-01 05:00 UTC = 14:00 KST
    expect(relativeTime("2026-08-01T05:00:00.000Z", NOW)).toBe("1일 오후");
  });

  it("달이 다르면 달을 함께 쓴다 (상세 화면에는 날짜 헤더가 없다)", () => {
    // 2026-07-31 05:00 UTC = 14:00 KST → 지난달이므로 "31일"만 쓰면 이번 달로 읽힌다
    expect(relativeTime("2026-07-31T05:00:00.000Z", NOW)).toBe("7월 31일 오후");
    // 두 달 전도 같은 규칙
    expect(relativeTime("2026-06-05T05:00:00.000Z", NOW)).toBe("6월 5일 오후");
  });

  it("경과 시간이 24시간을 넘어도 '어제'면 어제로 쓴다", () => {
    // 30시간 전이지만 KST 로는 전날 → "30시간 전"이 아니라 "어제 오전"
    expect(relativeTime("2026-08-03T19:00:00.000Z", NOW)).toBe("어제 오전");
  });

  it("해가 다르면 연도까지 쓴다 — 달만 쓰면 작년 글이 올해로 읽힌다", () => {
    // 달이 같고 해만 다른 경우가 핵심이다. 연도 비교를 빼도 달 비교만으로는 안 잡힌다.
    expect(relativeTime("2025-08-05T05:00:00.000Z", NOW)).toBe(
      "2025년 8월 5일 오후",
    );
    expect(relativeTime("2025-12-31T05:00:00.000Z", NOW)).toBe(
      "2025년 12월 31일 오후",
    );
  });

  it("기준 시각을 못 읽어도 예외를 던지지 않는다", () => {
    expect(() => relativeTime("2026-08-01T05:00:00.000Z", "")).not.toThrow();
    expect(relativeTime("2026-08-01T05:00:00.000Z", "")).toBe("");
  });

  it("발행시각을 못 읽어도 예외를 던지지 않는다", () => {
    // 예전에는 여기서 RangeError 가 나 목록 전체가 죽었다.
    // 수집 경계가 보장하는 값이지만(INV-C5), 깨졌을 때 화면이 통째로 사라지면 안 된다.
    expect(() => relativeTime("", NOW)).not.toThrow();
    expect(relativeTime("", NOW)).toBe("");
    expect(dayKey("이건 날짜가 아니다")).toBe("");
  });
});
