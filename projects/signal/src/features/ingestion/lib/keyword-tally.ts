import { normalizeTagName } from "@/entities/article";

/**
 * 뽑힌 키워드를 세고, 다음 호출에 실을 앵커 목록을 만든다 (keywords-and-kinds INV-B3·K6).
 *
 * 왜 스크립트가 아니라 여기 있나 (2026-08-16 감사): 원래 `scripts/keywords.ts` 안에 있었는데,
 * vitest 가 `src/**` 와 `tests/**` 만 돌기 때문에 **INV-B3 의 "합친다"가 실제로 일어나는
 * 유일한 자리가 테스트 밖에 있었다.** 앵커가 흔들리면 그다음 청크의 표기가 전부 흔들린다.
 */

export interface TallyEntry {
  /** 화면·프롬프트에 쓰는 표기. **처음 나온 것**을 쓴다. */
  display: string;
  /** 몇 번 나왔나. */
  n: number;
}

/** 정규화 이름 → 표기와 건수. 키가 정규화 이름인 것이 요점이다(INV-T2 와 같은 기준). */
export type Tally = Map<string, TallyEntry>;

/**
 * 프롬프트에 실을 앵커 목록의 상한 (INV-K6).
 *
 * 목록은 항목마다 통째로 실리므로 비용이 선형으로 는다(2026-08-10 실측: 100개가 898 토큰).
 * 자를 때 **자주 나온 것부터** 남긴다 — 표기를 맞출 값은 흔한 말이지 한 번 나온 말이 아니다.
 */
export const KNOWN_LIMIT = 80;

/**
 * 이름들을 센다. 같은 뜻이면 한 행으로 합친다.
 *
 * 합치는 판정은 `normalizeTagName` 에 맡긴다 — DB 유일성 키를 만드는 함수와 같은 것을 써야
 * 여기서 "2건"인 것이 저장 뒤에도 2건이다. 다른 기준을 쓰면 화면의 뱃지 건수가 실제와 갈린다.
 */
export function tally(counts: Tally, names: readonly string[]): void {
  for (const name of names) {
    const key = normalizeTagName(name);
    // 정규화하면 빈 값이 되는 것은 세지 않는다 — 저장도 안 되므로 세면 건수만 부푼다.
    if (key === "") continue;
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { display: name, n: 1 });
  }
}

/**
 * DB 가 이미 세어 준 건수로 집계를 시작한다 (INV-B3 의 "이미 쓰인 목록").
 *
 * `tally` 는 한 번에 1씩 올리는 함수라 DB 건수를 못 받는다. 매일 도는 주기는 이번에 뽑은
 * 것만 앵커로 삼으면 **어제까지 쓴 표기를 하나도 안 싣게** 되므로 여기서 이어받는다.
 *
 * 같은 정규화 키가 여러 줄로 오면 건수를 더한다 — DB 는 한 행이지만 부르는 쪽이 두 축을
 * 합쳐 넘길 수도 있고, 그때 뒤엣것이 앞엣것을 덮으면 건수가 조용히 줄어든다.
 */
export function tallyFrom(rows: readonly { name: string; n: number }[]): Tally {
  const counts: Tally = new Map();
  for (const { name, n } of rows) {
    const key = normalizeTagName(name);
    if (key === "" || !Number.isFinite(n) || n <= 0) continue;
    const cur = counts.get(key);
    if (cur) cur.n += n;
    else counts.set(key, { display: name, n });
  }
  return counts;
}

/** 건수 내림차순. 동률이면 표기순 — 안 정하면 같은 데이터에서 순서가 흔들린다. */
export function ranked(counts: Tally): TallyEntry[] {
  return [...counts.values()].sort((a, b) => b.n - a.n || a.display.localeCompare(b.display));
}

/** 프롬프트에 실을 표기 목록. 자주 나온 것부터 `limit` 개까지. */
export function anchorList(counts: Tally, limit: number = KNOWN_LIMIT): string[] {
  return ranked(counts)
    .slice(0, Math.max(0, limit))
    .map((v) => v.display);
}
