/**
 * 알림이 쓰는 상대 시각. `relativeDay` 를 감싸는 것이라 하루가 넘어가면 그쪽 문장이
 * 그대로 나온다 — 한 서비스 안에서 시각을 두 어휘로 말하지 않으려는 것이다.
 */
import { describe, expect, it } from "vitest";
import { relativeDay, relativeTime } from "./schedule";

const 지금 = new Date("2026-09-08T12:00:00.000Z");
const 전 = (ms: number) => new Date(지금.getTime() - ms).toISOString();

describe("상대 시각", () => {
  it("1분 안쪽은 「방금」이다", () => {
    expect(relativeTime(전(0), 지금)).toBe("방금");
    expect(relativeTime(전(59_000), 지금)).toBe("방금");
  });

  it("분·시간 단위로 오늘 안을 가른다 — 「오늘」만으로는 새 알림이 안 보인다", () => {
    expect(relativeTime(전(60_000), 지금)).toBe("1분 전");
    expect(relativeTime(전(59 * 60_000), 지금)).toBe("59분 전");
    expect(relativeTime(전(3_600_000), 지금)).toBe("1시간 전");
    expect(relativeTime(전(23 * 3_600_000), 지금)).toBe("23시간 전");
  });

  it("하루가 넘으면 날짜 쪽 어휘를 그대로 쓴다", () => {
    const 이틀전 = 전(2 * 86_400_000);

    expect(relativeTime(이틀전, 지금)).toBe(relativeDay(이틀전, 지금));
    expect(relativeTime(이틀전, 지금)).toBe("2일 전");
  });

  it("시계가 어긋나 미래로 찍힌 값은 「방금」으로 접는다 — 「-3분 전」을 보여주지 않는다", () => {
    expect(relativeTime(전(-5 * 60_000), 지금)).toBe("방금");
  });

  it("값이 아니면 빈 문자열이다", () => {
    expect(relativeTime("어제쯤", 지금)).toBe("");
  });
});
