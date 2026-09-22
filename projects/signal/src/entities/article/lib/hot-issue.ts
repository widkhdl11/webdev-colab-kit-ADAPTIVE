import { HALF_LIFE_HOURS } from "./ranking";

/**
 * 핫이슈 — 이슈성·문 배정·배치 (hot-issue.md INV-N3 · H1 · G3 · N4).
 *
 * 여기 있는 건 전부 순수 계산이다. 모델도 DB 도 안 부른다 — INV-N3 이 요구하는 것이
 * 정확히 그것이고("같은 글을 다시 물었을 때 다른 값이 나오면 날마다 기준이 흔들린다"),
 * 그래서 이 파일이 테스트로 붙들 수 있는 자리가 된다.
 */

const HOUR_MS = 3600_000;

/** 이번 범위에서 여는 유일한 문 (INV-H1). DB 제약도 이 값 하나만 받는다. */
export const GATE_ONE = "gate1";

export type Gate = typeof GATE_ONE;

/** 글의 종류 (INV-G1). 한 글이 둘 다일 수 있어서 배열로 다닌다. */
export type ArticleKind = "news" | "tool";

export interface IssueScoreInput {
  /**
   * 같은 사건을 다룬 발행처 수.
   *
   * **지금은 항상 1 이다** — 중복 제거가 정규화 원문 주소 기준이라 같은 발표를 두 매체가
   * 쓰면 서로 다른 글이다. 그래도 인자로 받아 곱한다(INV-N3): 식에서 빼면 같은 사건 묶기가
   * 붙는 날 계산이 조용히 달라지고, 그 전후를 대조할 수 없다.
   */
  crossPublisherCount: number;
  /** 소스 weight. 항목에 스냅샷하지 않고 설정에서 온다 (INV-R4). */
  weight: number;
  publishedAt: string;
  now: Date;
}

/**
 * 이슈성 = 교차 발행처 수 × 소스 weight × 시간감쇠 (INV-N3).
 *
 * 반감기는 랭킹 점수와 같은 값을 쓴다. 두 계산이 다른 반감기를 쓰면 핫이슈 안의 순서와
 * 피드의 순서가 어긋나서, 같은 글이 두 화면에서 다른 자리에 선다.
 *
 * **이 값으로 글을 들이지 않는다.** 들이는 것은 `assignGate` 가 중요도로 하고, 여기는
 * 문 안에서의 순서만 정한다 — 보도량은 발표 주체의 크기를 따라가기 때문이다(INV-N3).
 */
export function computeIssueScore({
  crossPublisherCount,
  weight,
  publishedAt,
  now,
}: IssueScoreInput): number {
  const published = Date.parse(publishedAt);
  // 읽을 수 없는 발행시각에 NaN 을 흘리면 비교가 전부 false 가 되어 정렬이 조용히 무너진다.
  // 0 을 주면 그 항목이 맨 뒤로 가고 나머지 순서는 그대로다 (computeScore 와 같은 처리).
  if (Number.isNaN(published)) return 0;

  const ageHours = Math.max(0, (now.getTime() - published) / HOUR_MS);
  const decay = 2 ** (-ageHours / HALF_LIFE_HOURS);
  return crossPublisherCount * weight * decay;
}

/**
 * 문 배정 (INV-H1). 중요도 ≥ 1 이면 `1번`, 아니면 비어 있다.
 *
 * **인자가 중요도 하나뿐인 것이 이 함수의 요점이다** (INV-N2 합산 금지). 이슈성이 배정에
 * 끼면 `중요도 3 + 이슈성 0` 과 `중요도 1 + 이슈성 높음` 이 같은 자리에 서는데,
 * 앞엣것은 반드시 봐야 하고 뒤엣것은 안 봐도 된다.
 *
 * `null` 은 판정을 못 받은 것이다(INV-G2 실패 처리). 0 과 다르다 — 0 은 물어봤고 아니었다.
 */
export function assignGate(importance: number | null): Gate | null {
  if (importance === null) return null;
  return importance >= 1 ? GATE_ONE : null;
}

export interface Placement {
  /** 핫이슈에 선다. 문턱을 넘은 글 전부다. */
  hotIssue: boolean;
  /**
   * 소식에 선다. 문턱을 못 넘은 글 전부다.
   *
   * **이름이 종류의 `뉴스` 와 다른 것을 가리킨다.** 여기 `news` 는 화면의 자리 이름이고,
   * 종류의 `news` 는 글의 성질이다. 배치는 후자를 안 읽는다 (INV-G3).
   */
  news: boolean;
  /** 스킬·툴에 선다. 핫이슈·소식과 **겹친다** — 어느 쪽에 섰든 툴이면 여기도 선다. */
  tools: boolean;
}

/**
 * 화면 배치 (INV-G3).
 *
 * |          | 문턱 넘음        | 못 넘음        |
 * | 툴 아님  | 핫이슈           | 소식           |
 * | 툴       | 핫이슈 + 스킬·툴 | 소식 + 스킬·툴 |
 *
 * **핫이슈와 소식은 종류를 안 본다.** 둘은 들어온 글 전부를 문턱으로 가른 두 자리라서,
 * 모든 글이 정확히 한쪽에 선다. 스킬·툴은 그 위에 겹쳐 `툴` 만 모아 보는 자리다.
 *
 * 2026-09-21 에 뒤집었다. 그 전에는 소식을 `뉴스` 로 걸렀는데, 그러면 **둘 중 어느 종류도
 * 아니라고 판정된 글이 화면 어디에도 안 선다** — 실측 117건 중 30건이 그랬다.
 * `kinds` 에서 읽는 것이 `tool` 하나뿐인 것이 이 함수의 요점이다.
 */
export function placeArticle({
  kinds,
  gate,
}: {
  kinds: readonly ArticleKind[];
  gate: Gate | null;
}): Placement {
  const isTool = kinds.includes("tool");
  const overThreshold = gate !== null;

  return {
    hotIssue: overThreshold,
    news: !overThreshold,
    tools: isTool,
  };
}

/*
 * `applyRunCap` 은 2026-09-21 에 없앴다 (INV-N4 개정 — 개수 상한 폐지).
 *
 * 이슈성이 낮은 것부터 잘랐는데, 이슈성에는 중요도가 안 들어간다(INV-N2 합산 금지).
 * 그래서 **판정이 제일 높게 매긴 글이 먼저 잘렸다** — 실측으로 중요도 2 세 건이 전부
 * 그 쪽에 있었다. `computeIssueScore` 는 남아 있다: 자르는 데는 안 쓰고 순서에만 쓴다.
 */

/** DB 에 적히는 이름 ↔ 코드의 값 (INV-G1). `parse-hot-issue` 의 표와 짝이다. */
const KIND_BY_STORED: Record<string, ArticleKind> = { news: "news", tool: "tool" };

/**
 * 저장된 종류 값을 읽는다 (INV-G1).
 *
 * **모르는 값은 버리되 행은 살린다.** 종류가 비어 있는 글은 소식에 서므로(INV-G3)
 * 버려도 화면에서 사라지지 않는다 — 2026-09-21 이전에는 사라졌고, 그게 이 조항을
 * 뒤집은 이유다. `toGate` 와 같은 규칙으로 읽는 쪽에서 한 번 더 본다.
 */
export function toArticleKinds(raw: readonly unknown[]): ArticleKind[] {
  const out: ArticleKind[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const kind = KIND_BY_STORED[value.trim()];
    if (kind && !out.includes(kind)) out.push(kind);
  }
  return out;
}

/**
 * 저장된 문 배정 값을 읽는다 (INV-H1).
 *
 * **모르는 값은 `null` 로 떨어뜨린다** — 「판정 못 받음」이다. 받아 주면 아직 안 여는 문의
 * 값이 화면까지 흘러, 그릴 자리가 없는 글이 핫이슈로 세어진다. DB 제약이 1차로 막지만
 * 백필·수동 SQL 이 만지는 칸이라 읽는 쪽에서도 본다(`toOfficialBasis` 와 같은 규칙).
 */
export function toGate(raw: unknown): Gate | null {
  return raw === GATE_ONE ? GATE_ONE : null;
}
