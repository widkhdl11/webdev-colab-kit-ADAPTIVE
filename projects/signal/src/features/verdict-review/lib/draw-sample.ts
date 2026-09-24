import {
  QUESTION_ORDER,
  REVIEW_WINDOW_MS,
  type ReviewItem,
  type ReviewSnapshot,
  type ReviewWeek,
  type WeekStatus,
} from "@/entities/verdict-review";

/**
 * 판정 검토의 표본 뽑기와 닫힘 판정 — 순수 함수 (docs/specs/verdict-review.md INV-VR1·VR5).
 * DB 는 여기서 만지지 않는다 — 그래야 표본 규칙을 가짜 DB 없이 테스트한다.
 */

export const SAMPLE_WINDOW_MS = 7 * 86_400_000;
export const PER_SIDE = 10;
export const PER_SOURCE_CAP = 5;

export interface Candidate {
  itemId: string;
  hot: boolean;
  snapshot: ReviewSnapshot;
}

/** 시드가 있는 난수 — 같은 표본을 다시 뽑을 수 있게. 시드는 주 행에 남는다. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * DB 행 → 표본 후보 (INV-VR1). 판정 시각이 창 밖이거나 미래이거나, 질문별 답이 없으면 null —
 * 채점할 판정이 없다. 핫이슈 = `gate` 가 있음.
 */
export function toCandidate(row: unknown, nowMs: number): Candidate | null {
  if (!isRecord(row)) return null;
  const judged = Date.parse(str(row.hot_issue_at));
  if (Number.isNaN(judged) || judged > nowMs || nowMs - judged > SAMPLE_WINDOW_MS) return null;
  const answers = row.hot_issue_answers;
  if (!isRecord(answers)) return null;
  const id = str(row.id);
  if (id === "") return null;
  const reasonsRaw = isRecord(row.hot_issue_reasons) ? row.hot_issue_reasons : {};
  const trueQuestions = QUESTION_ORDER.filter((q) => answers[q] === true);
  const reasons: Record<string, string> = {};
  for (const q of trueQuestions) {
    const r = reasonsRaw[q];
    if (typeof r === "string" && r.trim() !== "") reasons[q] = r.trim();
  }
  const url = str(row.original_url);
  return {
    itemId: id,
    hot: row.gate !== null && row.gate !== undefined,
    snapshot: {
      title: str(row.title_ko) || str(row.title),
      source: str(row.source_id),
      sourceName: str(row.source_name) || str(row.source_id),
      url: url === "" ? null : url,
      judgedAt: str(row.hot_issue_at),
      trueQuestions: [...trueQuestions],
      reasons,
      oneLine: str(row.one_line) || null,
      points: Array.isArray(row.summary_points)
        ? row.summary_points.filter((p): p is string => typeof p === "string").slice(0, 3)
        : [],
    },
  };
}

/** 지난 표본에 이미 들어간 글을 뺀다 — 실행이 밀려 창이 겹치면 같은 판정을 두 번 채점한다. */
export function excludeSampled(candidates: readonly Candidate[], sampled: ReadonlySet<string>): Candidate[] {
  return candidates.filter((c) => !sampled.has(c.itemId));
}

type Side = "hot" | "notHot";

/**
 * 핫이슈 10 + 아님 10, 각각 무작위, 한 출처 표본 전체 5건 이하 (INV-VR1).
 *
 * 양쪽을 **번갈아** 뽑고, 그래도 한쪽이 출처 상한 때문에 모자라면 **맞바꾼다** — 먼저 뽑은 쪽이
 * 출처를 선점해서, 반대쪽은 다른 출처로 채울 수 있었는데도 모자라게 되는 경우다.
 */
export function drawSample(
  candidates: readonly Candidate[],
  rng: () => number,
  perSide = PER_SIDE,
  cap = PER_SOURCE_CAP,
): { items: Candidate[]; shortfall: { hot: number; notHot: number } } {
  const pools: Record<Side, Candidate[]> = {
    hot: shuffle(candidates.filter((c) => c.hot), rng),
    notHot: shuffle(candidates.filter((c) => !c.hot), rng),
  };
  const blocked: Record<Side, Candidate[]> = { hot: [], notHot: [] };
  const picked: Record<Side, Candidate[]> = { hot: [], notHot: [] };
  const bySource = new Map<string, number>();
  const count = (s: string) => bySource.get(s) ?? 0;

  const take = (side: Side): boolean => {
    const pool = pools[side];
    while (pool.length > 0) {
      const c = pool.shift()!;
      if (count(c.snapshot.source) >= cap) {
        blocked[side].push(c);
        continue;
      }
      bySource.set(c.snapshot.source, count(c.snapshot.source) + 1);
      picked[side].push(c);
      return true;
    }
    return false;
  };
  const open: Record<Side, boolean> = { hot: true, notHot: true };
  while ((open.hot && picked.hot.length < perSide) || (open.notHot && picked.notHot.length < perSide)) {
    for (const side of ["hot", "notHot"] as const) {
      if (open[side] && picked[side].length < perSide) open[side] = take(side);
    }
  }

  const other: Record<Side, Side> = { hot: "notHot", notHot: "hot" };
  for (const side of ["hot", "notHot"] as const) {
    const o = other[side];
    for (const want of [...blocked[side]]) {
      if (picked[side].length >= perSide) break;
      const give = picked[o].findIndex((p) => p.snapshot.source === want.snapshot.source);
      if (give < 0) continue;
      const rest = [...pools[o], ...blocked[o]];
      const refill = rest.findIndex((c) => c.snapshot.source !== want.snapshot.source && count(c.snapshot.source) < cap);
      if (refill < 0) continue;
      const sub = rest[refill]!;
      pools[o] = rest.filter((_, i) => i !== refill);
      blocked[o] = [];
      // 같은 출처 하나가 빠지고 그 출처 글이 반대쪽에 들어간다 — 그 출처 수는 그대로, sub 의 출처만 +1
      picked[o][give] = sub;
      bySource.set(sub.snapshot.source, count(sub.snapshot.source) + 1);
      picked[side].push(want);
    }
  }

  // 화면 번호도 섞는다 — 앞 10건이 전부 핫이슈면 사람이 판정을 보기 전에 답을 짐작한다.
  return {
    items: shuffle([...picked.hot, ...picked.notHot], rng),
    shortfall: { hot: perSide - picked.hot.length, notHot: perSide - picked.notHot.length },
  };
}

/**
 * 이 주를 닫을지와 그 상태 (INV-VR5). 안 닫을 주면 null.
 * - 표본 전부에 답이 있으면 검토됨(0건 주는 검토됨이 아니다 — 수집이 멈춘 주가 정확도 없는 검토됨 줄을 만든다).
 * - 7일이 지났거나 이번 주가 아니면 검토 안 함. 매일 같은 시각쯤 돌아서, 지난주 추출보다 몇 초 이르게
 *   돌면 7일이 아직 안 찼다 — 그러면 열린 주가 둘이 된다.
 */
export function closeStatus(
  week: Pick<ReviewWeek, "week" | "extractedAt" | "status">,
  items: readonly Pick<ReviewItem, "answer">[],
  nowMs: number,
  currentWeek: string,
): WeekStatus | null {
  if (week.status !== null) return null;
  if (items.length > 0 && items.every((i) => i.answer !== null)) return "reviewed";
  const at = Date.parse(week.extractedAt);
  if (Number.isNaN(at) || nowMs - at >= REVIEW_WINDOW_MS || week.week !== currentWeek) return "unreviewed";
  return null;
}
