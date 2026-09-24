import type { Answer, Direction, ReviewItem, ReviewWeek, WeekStatus, WeekSummary } from "@/entities/verdict-review";
import type { Candidate } from "../lib/draw-sample";

/**
 * 판정 검토가 DB 에 하는 일 전부. 주간 실행과 답 쓰기는 이 모양만 안다 — 테스트는 가짜를 넣는다.
 * 실제 구현은 ./supabase-store.ts (server-only, secret 키).
 */
export interface ReviewStore {
  listWeeks(): Promise<ReviewWeek[]>;
  weekItems(week: string): Promise<ReviewItem[]>;
  /** 주 하나(없으면 null) */
  week(week: string): Promise<ReviewWeek | null>;
  /** 주어진 후보 중 이미 어느 표본에든 들어간 글 id (INV-VR1 — 다시 뽑지 않는다) */
  sampledItemIds(candidateIds: readonly string[]): Promise<Set<string>>;
  /** 판정 시각이 [sinceIso, untilIso] 인 글의 행(검증 전) */
  candidateRows(sinceIso: string, untilIso: string): Promise<unknown[]>;
  /** 주와 표본을 한 트랜잭션에서 만든다. 이미 있는 주면 false(아무것도 안 바꿈) — INV-VR2 */
  createWeek(input: {
    week: string;
    extractedAt: string;
    seed: number;
    poolSize: number;
    shortfall: { hot: number; notHot: number };
    items: readonly Candidate[];
  }): Promise<boolean>;
  /** 닫힘 표지를 커밋한다(이미 있으면 그대로). 진행 중인 답이 있으면 그것이 끝난 뒤에 커밋된다 — INV-VR5 */
  markClosing(week: string): Promise<void>;
  /** 닫는다. 이미 닫혔으면 아무것도 안 바꾼다(한 주에 집계 한 번) */
  closeWeek(week: string, status: WeekStatus, summary: WeekSummary, closedAt: string): Promise<void>;
  logRun(ok: boolean, message: string): Promise<void>;
  /** DB 함수 answer_verdict_item — 한 트랜잭션에서 잠그고·닫혔나 보고·쓴다(INV-VR4) */
  answer(week: string, itemId: string, answer: Answer, direction: Direction | null): Promise<AnswerResult>;
}

export type AnswerError = "no_week" | "closed" | "no_item" | "bad_answer" | "bad_direction" | "bad_input" | "forbidden";
export type AnswerResult = { ok: true } | { ok: false; error: AnswerError };

/** 화면이 서버 액션에 보내는 것 — 서버는 이것을 믿지 않고 다시 검사한다(answer.ts). */
export interface AnswerInput {
  week: string;
  itemId: string;
  answer: Answer;
  direction?: Exclude<Direction, "unknown">;
}

/** 서버 액션이 돌려주는 것 — 저장 뒤의 그 주와 표본(화면이 그대로 다시 그린다). */
export type AnswerActionResult =
  | { ok: true; week: ReviewWeek; items: ReviewItem[] }
  | { ok: false; error: AnswerError };
