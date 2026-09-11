import { RECOMMENDATION_REUSE_MS } from "./limits";

/**
 * 한 사용자의 추천 순서를 짧은 동안 다시 쓴다 (INV-G7).
 *
 * **담는 것은 순서뿐이다.** 결과를 통째로 담으면 그것이 시변 상태가 되어 모집이 닫혔거나
 * 글이 지워진 뒤에도 옛 내용이 그대로 뜬다. 순서만 남기고 값은 매번 데이터베이스에서 읽으면,
 * 낡을 수 있는 것은 순서 하나이고 사라진 글은 자연히 빠진다.
 *
 * **키가 사용자를 가르는 것이 이 파일에서 제일 중요하다.** 안 가르면 남의 순서가 내 홈에
 * 뜬다 — 그려지는 값은 내 세션으로 다시 읽은 것이라 못 볼 글이 보이지는 않지만,
 * 무엇이 위로 올라왔는지가 그 사람의 관심사와 이력에서 나온 것이다.
 *
 * **한계**: 프로세스 메모리다. 앱 인스턴스가 여럿이면 인스턴스마다 따로 센다.
 * 지금 이 프로젝트는 로컬에서만 돌아서 인스턴스가 하나다 — 여러 인스턴스로 가는 날
 * 이 문장이 거짓이 된다(스펙의 INV-G7 에도 같은 한계를 적어 두었다).
 */
export type ReuseStore = {
  get(userId: string): readonly string[] | null;
  set(userId: string, ranking: readonly string[]): void;
  /** 지금 들고 있는 항목 수. 검사가 「만료된 것을 걷어냈나」를 보는 데 쓴다 */
  size(): number;
};

type Options = {
  readonly ttlMs?: number;
  /** 시계를 밖에서 넣는다 — 만료 판정을 진짜 시간을 기다리지 않고 검사하기 위해서다 */
  readonly now?: () => number;
};

export function createReuseStore(options: Options = {}): ReuseStore {
  const ttlMs = options.ttlMs ?? RECOMMENDATION_REUSE_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { at: number; ranking: readonly string[] }>();

  return {
    get(userId) {
      const hit = entries.get(userId);
      if (hit === undefined) return null;
      if (now() - hit.at > ttlMs) {
        entries.delete(userId);
        return null;
      }
      return hit.ranking;
    },
    set(userId, ranking) {
      // **넣을 때 만료된 것을 걷어낸다.** 안 그러면 지우는 유일한 순간이 「그 사용자가 다시
      // 올 때」라, 홈을 한 번 열고 안 돌아온 사람의 항목이 프로세스가 사는 내내 남는다
      // (2026-09-10 security-reviewer). 넣는 횟수가 곧 사용자 수의 상한이라 이 훑기로 충분하다.
      const cutoff = now() - ttlMs;
      for (const [key, entry] of entries) if (entry.at < cutoff) entries.delete(key);

      // 사본을 담는다. 부르는 쪽이 같은 배열을 재활용하면 저장된 순서가 조용히 달라진다.
      entries.set(userId, { at: now(), ranking: [...ranking] });
    },
    /** 검사가 「걷어냈나」를 볼 수 있게 연다. 앱은 안 쓴다 */
    size: () => entries.size,
  };
}

/** 앱이 실제로 쓰는 한 벌. 테스트는 위 팩토리로 자기 것을 만든다. */
export const recommendationReuse: ReuseStore = createReuseStore();
