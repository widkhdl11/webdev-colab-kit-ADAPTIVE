import { dayKey } from "@/shared/lib/datetime";

/**
 * 랭킹 — ingestion-ranking INV-R1·R2·R3·R5 강제 지점.
 *
 * **점수는 저장하지 않는다(INV-R1).** 여기 있는 건 전부 조회 시점에 도는 순수 계산이다.
 * 저장해 두면 시간이 지나 낡고, 갱신 배치가 절반만 돌면 순위가 뒤섞인다.
 */

const HOUR_MS = 3600_000;

/**
 * 시간감쇠의 반감기(시간). 18시간이면 어제 아침 글이 오늘 아침 글의 절반쯤 된다 —
 * 수집이 매일 아침 한 번 도는 주기와 맞춘 값이다.
 *
 * 이 값을 바꾸면 피드 순서가 통째로 달라진다. 테스트가 값을 못 박고 있다.
 */
export const HALF_LIFE_HOURS = 18;

/** '뜨는 중'을 붙일 그룹당 개수 (INV-R5). design-rules 는 "그룹 안 상위"까지만 정했다. */
export const TRENDING_TOP_N = 3;

export interface ScoreInput {
  publishedAt: string;
  now: Date;
  weight: number;
}

/**
 * 점수 = 시간감쇠(발행시각, now) × 소스 weight (INV-R2).
 *
 * 같은 입력에 항상 같은 값이다 — 여기서 `Date.now()` 를 부르면 순수성이 깨지고
 * 정렬이 호출 시점마다 흔들린다. 그래서 now 를 인자로 받는다.
 */
export function computeScore({ publishedAt, now, weight }: ScoreInput): number {
  const published = Date.parse(publishedAt);
  // 읽을 수 없는 발행시각에 NaN 을 흘리면 비교가 전부 false 가 되어 정렬이 조용히 무너진다.
  // 0 을 주면 그 항목은 맨 뒤로 가고 나머지 순서는 그대로다.
  if (Number.isNaN(published)) return 0;

  // 미래 시각(소스가 잘못 준 값)은 나이 0 으로 눌러 감쇠가 1 을 넘지 않게 한다.
  const ageHours = Math.max(0, (now.getTime() - published) / HOUR_MS);
  const decay = 2 ** (-ageHours / HALF_LIFE_HOURS);
  return decay * weight;
}

export interface Rankable {
  id: string;
  score: number;
  publishedAt: string;
}

/**
 * 정렬 비교자 (INV-R3): 점수 내림차순 → 발행시각 내림차순 → id 오름차순.
 *
 * 마지막 id 단계가 있어야 "같은 데이터면 항상 같은 순서"가 성립한다.
 * 앞 두 단계가 동률일 때 0 을 돌려주면 순서가 엔진의 정렬 구현에 맡겨진다.
 */
export function compareForRanking(a: Rankable, b: Rankable): number {
  if (a.score !== b.score) return b.score - a.score;

  // 못 읽는 발행시각은 0 으로 눌러 비교를 결정적으로 만든다(NaN 비교는 전부 false).
  const at = Date.parse(a.publishedAt) || 0;
  const bt = Date.parse(b.publishedAt) || 0;
  if (at !== bt) return bt - at;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 날짜 그룹 안에서 상위 N 개에 '뜨는 중'을 붙인다 (INV-R5).
 *
 * **필터·정렬을 적용하기 전 목록에 걸어야 한다.** 필터 결과에 걸면 같은 글이
 * 필터에 따라 뱃지가 붙었다 떨어져, 뱃지가 무슨 뜻인지 알 수 없어진다.
 * 그래서 이 함수는 내부에서 스스로 정렬한다 — 받은 순서에 기대지 않는다.
 */
export function markTrending<T extends Rankable>(
  items: readonly T[],
  topN: number = TRENDING_TOP_N,
): (T & { isTrending: boolean })[] {
  const trending = new Set<string>();

  if (topN > 0) {
    const byDay = new Map<string, T[]>();
    for (const item of items) {
      const key = dayKey(item.publishedAt);
      // 날짜를 모르는 항목은 어느 그룹에도 넣지 않는다. 아무 그룹에나 넣으면
      // 그 그룹의 진짜 상위를 밀어낸다.
      if (key === "") continue;
      const group = byDay.get(key);
      if (group) group.push(item);
      else byDay.set(key, [item]);
    }

    for (const group of byDay.values()) {
      for (const item of [...group].sort(compareForRanking).slice(0, topN)) {
        trending.add(item.id);
      }
    }
  }

  return items.map((item) => ({ ...item, isTrending: trending.has(item.id) }));
}
