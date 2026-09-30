import { describe, expect, it } from "vitest";
import { BATCH_PUBLISHED_LOOKBACK_DAYS } from "./budgets";
import { batchStartIso, batchWindow } from "./candidate-window";

/**
 * 그날 배치의 시작 (2026-09-30 사용자 결정 `signal-20260930-1-d1`).
 *
 * 비싼 단계는 **이번 예약 실행이 맡은 글** — 가장 최근 예약 시각(오전 7시 KST) 이후
 * 처음 본 글만 후보로 본다. 이어달리기는 그 안에서 한 바퀴(300초)에 못 끝낸 몫을 잇는 것이지,
 * 지난 날짜 글을 채우는 것이 아니다.
 */
describe("batchStartIso — 가장 최근 예약 시각", () => {
  it("예약 시각 뒤에 돌면 오늘 7시(KST)가 시작이다", () => {
    const now = new Date("2026-09-30T07:56:00+09:00");
    expect(batchStartIso(now)).toBe(new Date("2026-09-30T07:00:00+09:00").toISOString());
  });

  it("밤늦게 이어달리거나 손으로 돌려도 오늘 7시가 시작이다", () => {
    const now = new Date("2026-09-30T23:59:00+09:00");
    expect(batchStartIso(now)).toBe(new Date("2026-09-30T07:00:00+09:00").toISOString());
  });

  it("예약 시각 전(새벽)에 돌면 **어제 7시**가 시작이다 — 어제 배치가 아직 진행 중이다", () => {
    // 0시로 끊으면 어제 7시~자정에 들어온 글을 아무 실행도 맡지 않는다.
    const now = new Date("2026-09-30T06:59:00+09:00");
    expect(batchStartIso(now)).toBe(new Date("2026-09-29T07:00:00+09:00").toISOString());
  });

  it("딱 7시에 돌면 오늘 배치다", () => {
    const now = new Date("2026-09-30T07:00:00+09:00");
    expect(batchStartIso(now)).toBe(now.toISOString());
  });

  it("지난 날짜 배치의 글은 창 밖이다 — 어제 낮에 처음 본 글은 오늘 후보가 아니다", () => {
    // 부재만 보면 절반이다. 안에 드는 것(위 네 항목)과 밖으로 나가는 것을 둘 다 본다.
    const now = new Date("2026-09-30T08:00:00+09:00");
    const yesterdayNoon = Date.parse("2026-09-29T12:00:00+09:00");
    expect(Date.parse(batchStartIso(now)!)).toBeGreaterThan(yesterdayNoon);
  });

  it("시각을 못 읽으면 null 이다 — 창을 안 건다", () => {
    expect(batchStartIso(new Date("깨진 값"))).toBeNull();
  });
});

describe("batchWindow — 처음 본 시각 + 발행 시각 하한", () => {
  const now = new Date("2026-09-30T07:56:00+09:00");

  it("처음 본 시각의 시작은 그날 배치의 시작이다", () => {
    expect(batchWindow(now)?.firstSeenFrom).toBe(batchStartIso(now));
  });

  it("발행 시각 하한은 배치 시작에서 이틀 전이다 — 늦게 올라온 어제 글은 든다", () => {
    expect(BATCH_PUBLISHED_LOOKBACK_DAYS).toBe(2);
    expect(batchWindow(now)?.publishedFrom).toBe(new Date("2026-09-28T07:00:00+09:00").toISOString());
    // 어제 아침 발행, 오늘 처음 본 글은 하한 안이다.
    expect(Date.parse(batchWindow(now)!.publishedFrom)).toBeLessThan(Date.parse("2026-09-29T09:00:00+09:00"));
  });

  it("새 소스의 몇 주 전 글은 하한 밖이다 — 오늘 처음 봤어도 후보가 아니다", () => {
    // 2026-09-30 리뷰(medium): 소스를 새로 넣으면 그 피드의 옛 글이 전부 「오늘 처음 본 글」이 된다.
    expect(Date.parse(batchWindow(now)!.publishedFrom)).toBeGreaterThan(Date.parse("2026-09-20T00:00:00+09:00"));
  });

  it("시각을 못 읽으면 null 이다", () => {
    expect(batchWindow(new Date("깨진 값"))).toBeNull();
  });
});
