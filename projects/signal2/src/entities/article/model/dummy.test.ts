import { describe, expect, it } from "vitest";

import { dummyArticles } from "./dummy";
import { kstDayKey } from "@/shared/lib/kst";

describe("dummyArticles", () => {
  it("기준 시각을 못 읽으면 빈 목록이다 — 화면이 죽지 않게", () => {
    expect(dummyArticles("날짜가 아님")).toEqual([]);
  });

  it("모든 소식이 과거다 — 미래 시각을 그리면 「3시간 뒤」가 된다", () => {
    const now = "2026-09-01T02:00:00+09:00";
    const nowMs = Date.parse(now);
    for (const article of dummyArticles(now)) {
      expect(Date.parse(article.publishedAt)).toBeLessThanOrEqual(nowMs);
    }
  });

  it("자정 직후에도 오늘 자리의 소식이 어제로 안 넘어간다", () => {
    // `nowMs - 60_000` 으로만 당기면 KST 00:00:30 에는 그 값이 전날이라
    // 오늘 자리 6건이 통째로 어제 그룹으로 넘어간다. 실제로 그랬다.
    const now = "2026-09-01T00:00:30+09:00";
    const todayKey = "2026-09-01";

    const keys = dummyArticles(now).map((a) => kstDayKey(a.publishedAt));
    const todayCount = keys.filter((k) => k === todayKey).length;

    expect(todayCount).toBeGreaterThan(0);
    // 낮에 열었을 때와 같은 수여야 한다 — 자정이라고 오늘치가 줄면 안 된다.
    const noonKeys = dummyArticles("2026-09-01T12:00:00+09:00").map((a) =>
      kstDayKey(a.publishedAt),
    );
    expect(todayCount).toBe(noonKeys.filter((k) => k === todayKey).length);
  });

  it("날짜 그룹은 기준 시각을 따라 움직인다", () => {
    const keys = new Set(
      dummyArticles("2026-08-15T12:00:00+09:00").map((a) =>
        kstDayKey(a.publishedAt),
      ),
    );
    expect(keys).toContain("2026-08-15");
    expect(keys).toContain("2026-08-14");
  });
});
