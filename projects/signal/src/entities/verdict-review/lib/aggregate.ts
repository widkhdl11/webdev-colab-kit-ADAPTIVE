import type { Answer, Direction, ReviewItem, ReviewWeek, WeekSummary } from "../model/types";

/**
 * 판정 검토의 집계 — **화면과 닫는 쪽이 같은 함수를 쓴다** (INV-VR6). 각자 세면 같은 주에 두 숫자가 뜬다.
 */

/** 한 주의 검토 기간. 추출 후 이만큼 지나면 답을 안 받는다 — DB 함수의 `interval '7 days'` 와 같아야 한다. */
export const REVIEW_WINDOW_MS = 7 * 86_400_000;

const inc = (obj: Record<string, number>, key: string) => {
  obj[key] = (obj[key] ?? 0) + 1;
};

/**
 * 판정에 붙을 수 있는 방향 (INV-VR3). DB 제약(`verdict_review_item_direction`)과 같아야 한다.
 * `unknown` 은 고르는 버튼이 아니라 안 고르고 닫은 결과라 여기 없다.
 */
export function directionsFor(hot: boolean): Direction[] {
  return hot ? ["should_not_be_hot", "wrong_reason"] : ["should_be_hot"];
}

/**
 * 틀린 답 하나가 만드는 오류 종류 (INV-VR7). 방향 × 질문이다.
 * 놓친 핫이슈와 참인 질문이 비어 있는 핫이슈 글은 방향만으로 한 종류 — 안 세면 그 오류가 매주
 * 나와도 반복 표시가 영영 안 뜬다. 어느 쪽인지 안 고른 답은 종류가 없다.
 */
export function errorKinds(item: Pick<ReviewItem, "snapshot">, answer: Answer | null, direction: Direction | null): string[] {
  if (answer !== "wrong") return [];
  const d = direction ?? "unknown";
  if (d === "should_be_hot") return ["should_be_hot"];
  if (d === "unknown") return [];
  const qs = item.snapshot.trueQuestions;
  return qs.length === 0 ? [d] : qs.map((q) => `${d}:${q}`);
}

/**
 * 한 주 표본의 집계 (INV-VR6). accuracy = 맞다 / (맞다 + 틀리다). 모르겠다는 분모에서 뺀다.
 * 분모가 0 이면 null — 0% 가 아니다.
 */
export function summarize(
  items: readonly ReviewItem[],
  times: { firstAnswerAt: string | null; completedAt: string | null } = { firstAnswerAt: null, completedAt: null },
): WeekSummary {
  const counts = { correct: 0, wrong: 0, unsure: 0 };
  const byDirection: Record<string, number> = {};
  const byQuestion: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const kinds: Record<string, number> = {};
  let answered = 0;
  for (const item of items) {
    if (item.answer === null) continue;
    answered += 1;
    counts[item.answer] += 1;
    if (item.answer !== "wrong") continue;
    inc(byDirection, item.direction ?? "unknown");
    inc(bySource, item.snapshot.source);
    // 질문별은 핫이슈 글의 오류만 센다. 아님 글에도 참인 질문이 남아 있을 수 있다 — 같은 사건이
    // 이미 있어 빠진 글(hot-issue INV-G4)과 배정이 실패한 글이 그렇다. 그 오류는 질문 탓이 아니다.
    if (item.hot) for (const q of item.snapshot.trueQuestions) inc(byQuestion, q);
    for (const k of errorKinds(item, item.answer, item.direction)) inc(kinds, k);
  }
  const denom = counts.correct + counts.wrong;
  const first = Date.parse(times.firstAnswerAt ?? "");
  const done = Date.parse(times.completedAt ?? "");
  return {
    total: items.length,
    answered,
    ...counts,
    accuracy: denom === 0 ? null : counts.correct / denom,
    byDirection,
    byQuestion,
    bySource,
    kinds,
    answerMinutes: Number.isNaN(first) || Number.isNaN(done) ? null : Math.round((done - first) / 60_000),
  };
}

/** 2026-W39 → 그 주 월요일(UTC 자정). ISO 주차: 1월 4일이 든 주가 1주다. */
export function weekMonday(week: string): number | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return null;
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7; // 월=0
  return jan4 - jan4Dow * 86_400_000 + (Number(m[2]) - 1) * 7 * 86_400_000;
}

export function consecutiveWeeks(a: string, b: string): boolean {
  const ma = weekMonday(a);
  const mb = weekMonday(b);
  return ma !== null && mb !== null && mb - ma === 7 * 86_400_000;
}

/** 2026-W39 → 「9/21 주」. 화면에 ISO 주차 표기를 그대로 내보내지 않는다. */
export function weekLabel(week: string): string {
  const m = weekMonday(week);
  if (m === null) return week;
  const d = new Date(m);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} 주`;
}

const SEOUL_OFFSET_MS = 9 * 3600_000;

/** 그 시각이 속한 ISO 주차(한국 시간). 월요일 아침 실행이 그 월요일의 주차를 갖는다. */
export function isoWeekKst(ms: number): string {
  const d = new Date(ms + SEOUL_OFFSET_MS);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(day).getUTCDay() + 6) % 7;
  const thursday = day + (3 - dow) * 86_400_000;
  const year = new Date(thursday).getUTCFullYear();
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * 답을 받는 주인가 (INV-VR5). DB 함수 `answer_verdict_item` 의 판정과 같아야 한다 — 어긋나면 화면은
 * 버튼을 켜 두는데 누르면 거부된다. 추출 시각을 못 읽으면 닫힌 것으로 본다.
 */
export function isAnswerOpen(week: Pick<ReviewWeek, "closingAt" | "status" | "extractedAt">, nowMs: number): boolean {
  if (week.closingAt !== null || week.status !== null) return false;
  const at = Date.parse(week.extractedAt);
  return !Number.isNaN(at) && nowMs - at < REVIEW_WINDOW_MS;
}

/**
 * 화면이 여는 주 — 답을 받는 주가 있으면 그 주(여럿이면 최근), 없으면 가장 최근 주. 없으면 null.
 * 수집 대시보드의 「눈여겨볼 것」과 판정 검토 탭이 같은 주를 보도록 한 자리에 둔다.
 */
export function pickReviewWeek<W extends Pick<ReviewWeek, "week" | "closingAt" | "status" | "extractedAt">>(
  weeks: readonly W[],
  nowMs: number,
): { week: W | null; open: boolean } {
  const byRecent = weeks.slice().sort((a, b) => b.week.localeCompare(a.week));
  const open = byRecent.find((w) => isAnswerOpen(w, nowMs));
  if (open) return { week: open, open: true };
  return { week: byRecent[0] ?? null, open: false };
}

export interface AccuracyBar {
  week: string;
  /** 막대 높이가 되는 정확도. 값이 없으면 null(검토 안 한 주·답이 다 안 모인 주) */
  accuracy: number | null;
  /** 값이 없을 때 막대 위에 적는 말: 「검토 안 함」 또는 「3/20」 */
  note: string | null;
  /** 이번 주의 답한 수·전체 — 스크린리더 문장용 */
  answered?: number;
  total?: number;
}

/**
 * 주별 정확도 막대 (INV-VR6): 지난 닫힌 주 최근 셋 + 이번 주.
 * 검토 안 한 주와, 답이 다 안 모인 이번 주는 값이 없다 — 반쯤 답한 정확도는 그 주의 정확도가 아니다.
 */
export function accuracyBars(
  history: readonly Pick<ReviewWeek, "week" | "status" | "summary">[],
  current: Pick<ReviewWeek, "week" | "status">,
  now: Pick<WeekSummary, "total" | "answered" | "accuracy">,
): AccuracyBar[] {
  const past = history
    .filter((w) => w.week !== current.week && w.status !== null)
    .slice()
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-3)
    .map((w) => ({
      week: w.week,
      accuracy: w.status === "reviewed" ? (w.summary?.accuracy ?? null) : null,
      note: w.status === "reviewed" ? null : "검토 안 함",
    }));
  const complete = now.total > 0 && now.answered === now.total;
  return [
    ...past,
    {
      week: current.week,
      accuracy: current.status === "reviewed" || complete ? now.accuracy : null,
      note: complete ? null : `${now.answered}/${now.total}`,
      answered: now.answered,
      total: now.total,
    },
  ];
}

export interface RepeatedKind {
  kind: string;
  weeks: string[];
  counts: number[];
}

/**
 * 수정안이 필요한 오류 종류 (INV-VR7). 닫힌 주들을 주차 순으로 훑는다.
 * - 켜짐: 연속한 두 검토됨 주에 같은 종류가 모두 나왔다. 사이에 검토 안 한 주가 끼거나 주가 비면 짝이 아니다.
 * - 꺼짐: 그 뒤 검토된 주에서 그 종류가 안 나왔다(수정 승인 후 줄었는지가 판정이다).
 * - 검토 안 한 주는 끄지 않는다 — 한 주를 못 봤다고 신호가 사라지면 원인은 그대로다.
 */
export function repeatedKinds(weeks: readonly Pick<ReviewWeek, "week" | "status" | "summary">[]): RepeatedKind[] {
  const sorted = weeks.filter((w) => w.status !== null).slice().sort((a, b) => a.week.localeCompare(b.week));
  const active = new Map<string, { weeks: string[]; counts: number[] }>();
  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    if (cur.status !== "reviewed") continue;
    const now = cur.summary?.kinds ?? {};
    for (const [kind, v] of active) {
      const n = now[kind] ?? 0;
      if (n > 0) {
        v.weeks.push(cur.week);
        v.counts.push(n);
      } else active.delete(kind);
    }
    const prev = sorted[i - 1];
    if (!prev || prev.status !== "reviewed" || !consecutiveWeeks(prev.week, cur.week)) continue;
    const before = prev.summary?.kinds ?? {};
    for (const [kind, n] of Object.entries(now)) {
      const b = before[kind] ?? 0;
      if (active.has(kind) || !(b > 0 && n > 0)) continue;
      active.set(kind, { weeks: [prev.week, cur.week], counts: [b, n] });
    }
  }
  return [...active.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([kind, v]) => ({ kind, ...v }));
}

/** 0.8 → "80%". null → "—" (값 없음). */
export function fmtPct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}
