import { describe, expect, it } from "vitest";

import { dayGroupLabel, kstDayKey, relativeTime } from "./kst";

describe("kstDayKey", () => {
  it("UTC 로는 전날인 시각도 KST 기준 날짜로 묶는다", () => {
    // UTC 15:00 = KST 다음날 00:00. 실행 환경 시간대에 맡기면 여기서 갈린다.
    expect(kstDayKey("2026-08-30T15:00:00.000Z")).toBe("2026-08-31");
    expect(kstDayKey("2026-08-30T14:59:59.000Z")).toBe("2026-08-30");
  });

  it("오프셋이 붙은 표기도 같은 순간이면 같은 키를 준다", () => {
    expect(kstDayKey("2026-08-31T00:00:00+09:00")).toBe("2026-08-31");
    expect(kstDayKey("2026-08-30T15:00:00.000Z")).toBe("2026-08-31");
  });

  it("해석할 수 없는 값은 null 이다 — 한 건이 화면 전체를 죽이지 않게", () => {
    expect(kstDayKey("어제쯤")).toBeNull();
    expect(kstDayKey("")).toBeNull();
  });
});

describe("dayGroupLabel", () => {
  const now = "2026-08-31T09:00:00+09:00";

  it("오늘과 어제는 이름으로 부른다", () => {
    expect(dayGroupLabel("2026-08-31", now)).toBe("오늘");
    expect(dayGroupLabel("2026-08-30", now)).toBe("어제");
  });

  it("그 앞은 날짜와 요일로 쓴다", () => {
    expect(dayGroupLabel("2026-08-29", now)).toBe("8월 29일 (토)");
  });

  it("달을 넘어가는 어제도 어제다", () => {
    // 9월 1일의 어제는 8월 31일 — 하루를 빼는 방식이 월말에서 깨지지 않는지 본다.
    expect(dayGroupLabel("2026-08-31", "2026-09-01T09:00:00+09:00")).toBe("어제");
  });
});

describe("relativeTime", () => {
  const now = "2026-08-31T18:00:00+09:00";

  it("같은 날이면 경과 시간으로 쓴다", () => {
    expect(relativeTime("2026-08-31T16:00:00+09:00", now)).toBe("2시간 전");
    expect(relativeTime("2026-08-31T17:30:00+09:00", now)).toBe("30분 전");
    expect(relativeTime("2026-08-31T17:59:40+09:00", now)).toBe("방금");
  });

  it("어제와 그 앞은 오전·오후로 나눠 쓴다", () => {
    expect(relativeTime("2026-08-30T15:00:00+09:00", now)).toBe("어제 오후");
    expect(relativeTime("2026-08-30T09:00:00+09:00", now)).toBe("어제 오전");
    expect(relativeTime("2026-08-29T14:00:00+09:00", now)).toBe("29일 오후");
  });

  it("정오는 오후로 가른다", () => {
    expect(relativeTime("2026-08-30T12:00:00+09:00", now)).toBe("어제 오후");
    expect(relativeTime("2026-08-30T11:59:00+09:00", now)).toBe("어제 오전");
  });
});
