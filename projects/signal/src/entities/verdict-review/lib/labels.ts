import type { Answer, Direction } from "../model/types";

/**
 * 판정 검토 화면의 말. 질문 라벨은 상세 화면(article-view.tsx)과 같아야 한다 — 테스트가 대조한다.
 * 키는 저장된 판정의 질문 키(DB 값)다.
 */
export const QUESTION_LABELS: Readonly<Record<string, string>> = {
  "변화": "실무 영향",
  "방향": "흐름 변화",
  "기회": "시한 있음",
};

/** 질문을 화면에 늘어놓는 순서 — 상세 화면의 signal 포인트 순서와 같다. */
export const QUESTION_ORDER = ["변화", "방향", "기회"] as const;

export const ANSWER_LABELS: Readonly<Record<Answer, string>> = {
  correct: "맞다",
  wrong: "틀리다",
  unsure: "모르겠다",
};

/** 버튼에 쓰는 말 — 사람이 고르는 방향. */
export const DIRECTION_LABELS: Readonly<Record<Direction, string>> = {
  should_be_hot: "핫이슈여야 함",
  should_not_be_hot: "핫이슈가 아니어야 함",
  wrong_reason: "근거가 엉뚱함",
  unknown: "어느 쪽인지 안 고름",
};

/** 집계에 쓰는 말 — 오류의 이름. */
export const DIRECTION_ERROR_LABELS: Readonly<Record<Direction, string>> = {
  should_be_hot: "놓친 핫이슈",
  should_not_be_hot: "잘못 뽑음",
  wrong_reason: "근거 오류",
  unknown: "어느 쪽인지 안 고름",
};

/** 오류 종류 → 사람이 읽는 이름. 「잘못 뽑음 · 시한 있음」 */
export function kindLabel(kind: string): string {
  const [d, q] = kind.split(":");
  const head = DIRECTION_ERROR_LABELS[d as Direction] ?? d ?? kind;
  return q === undefined ? head : `${head} · ${QUESTION_LABELS[q] ?? q}`;
}
