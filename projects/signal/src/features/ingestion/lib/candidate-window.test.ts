import { describe, expect, it } from "vitest";
import { CANDIDATE_WINDOW_DAYS } from "./budgets";
import { ENRICH_FLOOR_ISO } from "./budgets";
import { candidateWindowStartIso, enrichWindowStartIso } from "./candidate-window";

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

/**
 * 기준 시각 — **이 시각 이전에 발행된 글에는 돈을 쓰지 않는다** (2026-09-23 사용자 결정).
 *
 * 왜 창을 좁히는 대신 시각을 박나: 3일 창이 하는 일은 「수집이 실패한 날 글을 다음 날
 * 주워 담기」다. 창을 하루로 좁히면 그 안전망이 사라진다. 기준 시각은 **한 번 지나간
 * 과거**만 잘라 내므로 앞으로의 안전망은 그대로 산다.
 *
 * 2026-09-23 에 건수 상한을 없애자 그때까지 밀려 있던 273건이 한꺼번에 후보가 됐고,
 * 다섯 바퀴에 $2.35 를 쓰고도 180건이 남았다. 그 글들은 이미 지나간 날짜 자리에 있어
 * 요약이 채워져도 그날 아무도 안 본다 — 기록으로만 온전해지는 값에 낼 돈이 아니다.
 */
describe("기준 시각 — 지난 글에는 돈을 안 쓴다", () => {
  it("창이 기준 시각보다 넓으면 **기준 시각**이 이긴다", () => {
    // 창은 3일 전부터지만 기준 시각이 어제라면, 그저께 글은 후보가 아니다.
    const now = new Date("2026-09-25T04:00:00.000Z");
    const floor = "2026-09-24T00:00:00.000Z";
    expect(candidateWindowStartIso(now, 3, floor)).toBe(floor);
  });

  it("창이 기준 시각보다 좁으면 **창**이 이긴다 — 기준 시각이 창을 넓히지 않는다", () => {
    // 기준 시각이 한참 과거라고 해서 3일 창이 무효가 되면 안 된다. 둘 중 늦은 쪽이다.
    const now = new Date("2026-09-25T04:00:00.000Z");
    const windowOnly = candidateWindowStartIso(now, 3);
    expect(candidateWindowStartIso(now, 3, "2020-01-01T00:00:00.000Z")).toBe(windowOnly);
  });

  it("기준 시각을 안 주면 창만 쓴다 — 없던 동작이 바뀌지 않는다", () => {
    const now = new Date("2026-09-25T04:00:00.000Z");
    expect(candidateWindowStartIso(now, 3)).toBe(candidateWindowStartIso(now, 3, undefined));
  });

  it("기준 시각이 읽을 수 없는 값이면 **무시하고 창을 쓴다**", () => {
    // 여기서 null 을 돌려주면 창이 통째로 사라져 **더 넓어진다** — 아끼려던 것이
    // 반대로 옛날 글 전부를 후보로 만든다. 못 읽는 설정은 없는 것으로 본다.
    const now = new Date("2026-09-25T04:00:00.000Z");
    expect(candidateWindowStartIso(now, 3, "어제쯤")).toBe(candidateWindowStartIso(now, 3));
  });
});

describe("enrichWindowStartIso — 돈 드는 단계가 쓰는 창", () => {
  it("기준 시각 이전은 안 본다 — 창이 더 넓어도 기준 시각에서 끊긴다", () => {
    // 기준 시각 바로 다음 날: 3일 창이면 기준 시각보다 앞까지 거슬러 가지만, 안 간다.
    const now = new Date(Date.parse(ENRICH_FLOOR_ISO) + 24 * 60 * 60 * 1000);
    expect(enrichWindowStartIso(now)).toBe(ENRICH_FLOOR_ISO);
  });

  it("시간이 충분히 지나면 창이 다시 기준이 된다 — 기준 시각이 영원히 창을 대신하지 않는다", () => {
    // 기준 시각에서 열흘 뒤: 3일 창이 기준 시각보다 늦으므로 창이 이긴다.
    const now = new Date(Date.parse(ENRICH_FLOOR_ISO) + 10 * 24 * 60 * 60 * 1000);
    expect(enrichWindowStartIso(now)).toBe(candidateWindowStartIso(now));
    expect(Date.parse(enrichWindowStartIso(now)!)).toBeGreaterThan(Date.parse(ENRICH_FLOOR_ISO));
  });

  it("주제·핫이슈가 쓰는 창은 안 건드린다 — 판정이 멈추면 화면이 틀린다", () => {
    const now = new Date(Date.parse(ENRICH_FLOOR_ISO) + 24 * 60 * 60 * 1000);
    // 같은 시각인데 둘이 달라야 한다. 같아지면 기준 시각이 판정에도 걸린 것이다.
    expect(candidateWindowStartIso(now)).not.toBe(enrichWindowStartIso(now));
  });
});
