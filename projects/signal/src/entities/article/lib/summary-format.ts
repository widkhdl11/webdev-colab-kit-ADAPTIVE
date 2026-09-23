/**
 * 요약을 칸으로 나눠 다루는 규칙 — ingestion-ranking INV-S7·S8 · content-safety INV-D7 ·
 * hot-issue INV-G2 (2026-09-23 사용자 결정: 상세 화면 재구성).
 *
 * 한 줄 요약 · 핵심 셋 · 표 · signal 포인트 근거는 **따로 저장된 칸**이다. 여기서는 모델 응답과
 * 저장된 값의 모양을 검사만 하고, 글자 안의 기호는 해석하지 않는다(INV-D7) — 해석할 것이 없으면
 * 요약에 심은 표기가 서식이 될 길도 없다.
 *
 * 수집(저장할 때)과 화면(그릴 때)이 **같은 함수**로 검사한다. 한쪽만 검사하면 검사를 바꾼 날
 * 이미 저장된 값이 화면에서 깨진다.
 */

/** 한 줄 요약의 최대 길이(글자). 경계는 포함이다. */
export const ONE_LINE_MAX_CHARS = 80;
/** 핵심은 정확히 셋이다 (INV-S7). */
export const KEY_POINT_COUNT = 3;

/** 표 한도 — 390px 에서 가로 스크롤 없이 들어가는 크기(design-rules 2026-09-23). */
export const TABLE_MIN_COLS = 2;
export const TABLE_MAX_COLS = 3;
export const TABLE_MAX_ROWS = 8;

export interface SummaryTable {
  head: string[];
  rows: string[][];
}

/**
 * 문장 끝 — 마침표·물음표·느낌표 **뒤가 공백이거나 끝**일 때만 센다.
 * `5.5`·`$4.00` 처럼 숫자 안의 마침표는 뒤에 글자가 붙어 있어 세지 않는다.
 */
const SENTENCE_END = /[.!?](?=\s|$)/g;

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** 완결 문장인가 — 문장 부호로 끝난다. 명사 조각(「가격 인하」)을 거른다. */
export function isCompleteSentence(value: string): boolean {
  return /[.!?]$/.test(collapse(value));
}

/** 한 줄 요약인가 (INV-S8) — 한 문장, 80자 이내, 문장 부호로 끝난다. */
export function isOneLine(value: string): boolean {
  const s = collapse(value);
  if (s === "" || [...s].length > ONE_LINE_MAX_CHARS) return false;
  if (!isCompleteSentence(s)) return false;
  return (s.match(SENTENCE_END) ?? []).length === 1;
}

/**
 * 핵심 셋을 받는다 (INV-S7). 정확히 셋이고 전부 완결 문장이어야 한다 — 하나라도 어기면
 * `null`(요약 전체 실패, INV-S8). 반쪽을 저장하면 그 글은 다시 요약되지 않는다.
 */
export function parseKeyPoints(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== KEY_POINT_COUNT) return null;
  if (!value.every((v): v is string => typeof v === "string")) return null;
  const points = value.map(collapse);
  return points.every(isCompleteSentence) ? points : null;
}

/**
 * 표 칸을 받는다 (INV-D7). 열 2~3·본문 행 1~8·빈 칸 없음. 못 맞추면 `null` — 표만 버린다(S30).
 * 칸 안의 줄바꿈·연속 공백은 한 칸으로 접는다.
 */
export function parseSummaryTable(value: unknown): SummaryTable | null {
  if (typeof value !== "object" || value === null) return null;
  const { head, rows } = value as { head?: unknown; rows?: unknown };
  const isRow = (r: unknown): r is string[] =>
    Array.isArray(r) && r.every((c) => typeof c === "string" && c.trim() !== "");
  if (!isRow(head) || !Array.isArray(rows) || !rows.every(isRow)) return null;
  const cols = head.length;
  if (cols < TABLE_MIN_COLS || cols > TABLE_MAX_COLS) return null;
  if (rows.length === 0 || rows.length > TABLE_MAX_ROWS) return null;
  if (rows.some((r) => r.length !== cols)) return null;
  return { head: head.map(collapse), rows: rows.map((r) => r.map(collapse)) };
}

/**
 * 핫이슈 판정 질문의 키와 순서 (hot-issue INV-G2).
 *
 * 수집 쪽 질문 목록(`HOT_ISSUE_QUESTIONS`)과 키가 같아야 한다 — 그쪽 테스트가 둘을 대조한다.
 * 여기 두는 이유: 화면은 수집(features)을 가져올 수 없고, 순서가 화면 순서다.
 */
export const SIGNAL_KEYS = ["변화", "방향", "기회"] as const;
export type SignalKey = (typeof SIGNAL_KEYS)[number];

export interface SignalPoint {
  key: SignalKey;
  /** 근거 한 문장. 저장 전 판정이거나 근거를 버렸으면 null — 라벨만 선다(S31d). */
  reason: string | null;
}

/**
 * 참인 질문마다 한 줄 (hot-issue INV-G2). 판정이 없거나 참이 하나도 없으면 빈 목록 —
 * 화면은 그때 절을 **그리지 않는다**("해당 없음"이라고 쓰지 않는다).
 * 모르는 키는 버린다: 화면 라벨이 없는 줄이 서면 안 된다.
 */
export function signalPoints(answers: unknown, reasons: unknown): SignalPoint[] {
  if (typeof answers !== "object" || answers === null) return [];
  const a = answers as Record<string, unknown>;
  const r = typeof reasons === "object" && reasons !== null ? (reasons as Record<string, unknown>) : {};
  return SIGNAL_KEYS.filter((key) => a[key] === true).map((key) => {
    const raw = r[key];
    const reason = typeof raw === "string" && raw.trim() !== "" ? collapse(raw) : null;
    return { key, reason };
  });
}
