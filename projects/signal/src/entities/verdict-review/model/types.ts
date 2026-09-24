/**
 * 판정 검토 — docs/specs/verdict-review.md.
 *
 * 저장된 판정의 질문 키는 DB 값이라 한글이다(`변화`·`방향`·`기회`, summary-format.ts 의
 * SIGNAL_STORED_KEYS). 코드 안에서는 그 문자열을 값으로만 다룬다.
 */

export type Answer = "correct" | "wrong" | "unsure";
export type Direction = "should_be_hot" | "should_not_be_hot" | "wrong_reason" | "unknown";
export type WeekStatus = "reviewed" | "unreviewed";

/** 뽑은 순간의 사본 (INV-VR2) — 원본 글의 판정이 나중에 바뀌어도 채점한 판정은 이것이다. */
export interface ReviewSnapshot {
  title: string;
  source: string;
  sourceName: string;
  url: string | null;
  judgedAt: string;
  trueQuestions: string[];
  reasons: Record<string, string>;
  oneLine: string | null;
  points: string[];
}

export interface ReviewItem {
  itemId: string;
  position: number;
  hot: boolean;
  snapshot: ReviewSnapshot;
  answer: Answer | null;
  direction: Direction | null;
  answeredAt: string | null;
}

export interface Shortfall {
  hot: number;
  notHot: number;
}

/** 닫힐 때 남기는 집계 한 줄 (INV-VR6). */
export interface WeekSummary {
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  unsure: number;
  /** 맞다/(맞다+틀리다). 분모가 0 이거나 검토 안 한 주면 null — 0% 가 아니다. */
  accuracy: number | null;
  byDirection: Record<string, number>;
  byQuestion: Record<string, number>;
  bySource: Record<string, number>;
  /** 오류 종류(방향 × 질문) → 건수 (INV-VR7) */
  kinds: Record<string, number>;
  /** 첫 답 → 전부 답한 순간. 모르면 null */
  answerMinutes: number | null;
}

export interface ReviewWeek {
  week: string;
  extractedAt: string;
  poolSize: number;
  shortfall: Shortfall;
  firstAnswerAt: string | null;
  completedAt: string | null;
  closingAt: string | null;
  status: WeekStatus | null;
  closedAt: string | null;
  summary: WeekSummary | null;
}

export interface ReviewRun {
  ranAt: string;
  ok: boolean;
  message: string;
}
