import { describe, expect, it } from "vitest";
import { CANDIDATE_WINDOW_DAYS } from "./budgets";
import { candidateWindowStartIso } from "./candidate-window";

/**
 * 후보 창 (2026-09-22 사용자 결정).
 *
 * 여기서 붙드는 것은 하나다 — **오늘 들어온 글은 언제 들어왔든 창 안이다.**
 * 이게 깨지면 증상이 조용하다: 화면에 글은 뜨는데 요약도 키워드도 안 붙고,
 * 리포트는 "후보 0건"이라 정상으로 보인다.
 */
describe("후보 창", () => {
  const start = (iso: string) => candidateWindowStartIso(new Date(iso));

  it("오늘 새벽 0시(KST)에 나온 글도 창 안이다", () => {
    // KST 0시 = 전날 15:00Z. 창 시작이 이보다 뒤면 그 글이 후보에서 빠진다.
    const now = "2026-09-22T00:30:00+09:00";
    const midnightKst = Date.parse("2026-09-22T00:00:00+09:00");
    expect(Date.parse(start(now)!)).toBeLessThanOrEqual(midnightKst);
  });

  it("오늘 밤 늦게 도는 바퀴에서도 오늘 0시 글이 창 안이다", () => {
    const now = "2026-09-22T23:59:00+09:00";
    const midnightKst = Date.parse("2026-09-22T00:00:00+09:00");
    expect(Date.parse(start(now)!)).toBeLessThanOrEqual(midnightKst);
  });

  it("오늘을 포함해 3일치다 — 그저께 0시(KST)가 시작이다", () => {
    const now = "2026-09-22T07:00:00+09:00";
    expect(start(now)).toBe(new Date("2026-09-20T00:00:00+09:00").toISOString());
  });

  it("창 밖은 실제로 잘린다 — 나흘 전 글은 시작보다 앞이다", () => {
    // 부재만 확인하면 절반이다. 안에 드는 것과 밖으로 나가는 것을 둘 다 본다.
    const now = "2026-09-22T07:00:00+09:00";
    const fourDaysAgo = Date.parse("2026-09-18T12:00:00+09:00");
    expect(Date.parse(start(now)!)).toBeGreaterThan(fourDaysAgo);
  });

  it("일수를 줄이면 시작이 뒤로 온다 — 상수가 실제로 계산에 쓰인다", () => {
    // 이 항목이 없으면 `CANDIDATE_WINDOW_DAYS` 를 무시하고 고정값을 써도 통과한다.
    const now = "2026-09-22T07:00:00+09:00";
    expect(Date.parse(start(now)!)).toBeLessThan(
      Date.parse(candidateWindowStartIso(new Date(now), CANDIDATE_WINDOW_DAYS - 1)!),
    );
  });

  it("시각을 못 읽으면 null 이다 — 창을 안 걸고 전체를 본다", () => {
    // 조용히 0건을 보는 것보다 조용히 전체를 보는 쪽이 낫다. 전자는 수집이 멈추고
    // 후자는 요금이 더 나갈 뿐이다.
    expect(candidateWindowStartIso(new Date("깨진 값"))).toBeNull();
  });
});
