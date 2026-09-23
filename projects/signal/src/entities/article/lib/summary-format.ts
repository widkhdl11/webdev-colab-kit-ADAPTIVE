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
 * 문장 부호 뒤에 붙어도 문장 끝으로 보는 닫는 기호 — `…했다"` · `…했다)` · `「…했다」`.
 * 이걸 떼지 않으면 인용으로 끝나는 정상 문장을 명사 조각으로 떨어뜨린다(2026-09-23 코드 리뷰).
 */
const CLOSERS = "\"'”’)\\]」』》";
const TRAILING_CLOSERS = new RegExp(`[${CLOSERS}]+$`);

/**
 * 문장 끝 후보 — 문장 부호(연달아 와도 하나) + 닫는 기호, **뒤가 공백이거나 끝**일 때만.
 * `5.5`·`$4.00` 처럼 숫자 안의 마침표는 뒤에 글자가 붙어 있어 후보가 아니다.
 */
const SENTENCE_END = new RegExp(`[.!?]+[${CLOSERS}]*(?=\\s|$)`, "g");

/**
 * 마침표로 끝나도 문장 끝이 아닌 영어 약어. 한 글자짜리(`U.S.`·`e.g.`의 각 글자)는 목록 없이
 * 규칙으로 거른다. 대소문자는 가리지 않는다.
 */
const ABBREVIATIONS = new Set([
  "vs", "inc", "co", "corp", "ltd", "llc", "no", "nos", "mr", "mrs", "ms", "dr", "prof",
  "jr", "sr", "st", "etc", "approx", "dept", "est", "fig", "vol", "ver",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
]);

/** 이 후보가 약어·말줄임표의 마침표라 문장 끝이 아닌가. */
function isFalseEnd(s: string, index: number, mark: string): boolean {
  const punct = mark.replace(TRAILING_CLOSERS, "");
  // 마침표 둘 이상(`..`·`...`)은 말줄임표다. `?!` 같은 조합은 문장 끝 그대로다.
  if (/^\.{2,}$/.test(punct)) return true;
  if (punct !== ".") return false;
  const before = s.slice(0, index);
  // 한국식 날짜(`2026. 9. 23.`) — 숫자 뒤 마침표가 다음 숫자로 이어지거나 앞 숫자에서 이어져 온다.
  if (/\d$/.test(before) && (/^\s\d/.test(s.slice(index + mark.length)) || /\d\.\s\d{1,2}$/.test(before))) {
    return true;
  }
  // 약어는 **낱말 전체**여야 한다 — 앞이 줄 처음·공백·마침표·여는 괄호일 때만. 안 그러면
  // `GPT-4o.`·`70B.` 의 끝 글자를 한 글자 약어로 보고 뒤 문장을 삼킨다(2026-09-23 재리뷰).
  const word = /(?:^|[\s.(])([A-Za-z]+)$/.exec(before);
  if (word === null) return false;
  return word[1].length === 1 || ABBREVIATIONS.has(word[1].toLowerCase());
}
// 알려진 한계 — 둘로 센다(드물고, 지시문이 문장 끝 말고는 부호를 쓰지 말라고 한다):
// 느낌표가 붙은 고유명사(`Yahoo! 재팬`), 따옴표와 조사를 띄운 인용(`"왜 지금인가?" 라고`).

/**
 * 문장 **사이의** 끝 개수 — 마지막 문장 부호는 세지 않는다. 마지막이 약어로 끝나도
 * (`… 시장에 들어온 U.S.`) 그건 문장의 끝이 맞기 때문이다.
 */
function innerSentenceEnds(s: string): number {
  let count = 0;
  for (const m of s.matchAll(SENTENCE_END)) {
    const index = m.index ?? 0;
    if (index + m[0].length >= s.length) continue;
    if (!isFalseEnd(s, index, m[0])) count += 1;
  }
  return count;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * 완결 문장인가 — 문장 부호로 끝난다(뒤에 붙은 닫는 따옴표·괄호는 떼고 본다).
 * 명사 조각(「가격 인하」)을 거른다.
 */
export function isCompleteSentence(value: string): boolean {
  return /[.!?]$/.test(collapse(value).replace(TRAILING_CLOSERS, ""));
}

/** 한 줄 요약인가 (INV-S8) — 한 문장, 80자 이내, 문장 부호로 끝난다. */
export function isOneLine(value: string): boolean {
  const s = collapse(value);
  if (s === "" || [...s].length > ONE_LINE_MAX_CHARS) return false;
  if (!isCompleteSentence(s)) return false;
  return innerSentenceEnds(s) === 0;
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
 * 핫이슈 판정 질문의 id 와 순서 (hot-issue INV-G2). 순서가 화면 순서다.
 *
 * 코드 안에서는 ASCII id 로 다룬다(CLAUDE.md 식별자 규칙). 저장된 판정(0009·0011 의 jsonb)과
 * 모델 응답은 한글 키를 쓰므로 둘을 잇는 곳은 아래 `SIGNAL_STORED_KEYS` 한 곳뿐이다.
 * 여기 두는 이유: 화면은 수집(features)을 가져올 수 없다.
 */
export const SIGNAL_KEYS = ["change", "direction", "window"] as const;
export type SignalKey = (typeof SIGNAL_KEYS)[number];

/**
 * 저장된 판정의 키 — 수집 쪽 질문 목록(`HOT_ISSUE_QUESTIONS`)의 key 와 같아야 한다(그쪽 테스트가
 * 대조한다). 식별자가 아니라 DB 에 들어 있는 **값**이다 — 바꾸면 이미 저장된 판정을 못 읽는다.
 */
export const SIGNAL_STORED_KEYS: Readonly<Record<SignalKey, string>> = {
  change: "변화",
  direction: "방향",
  window: "기회",
};

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
  return SIGNAL_KEYS.filter((key) => a[SIGNAL_STORED_KEYS[key]] === true).map((key) => {
    const raw = r[SIGNAL_STORED_KEYS[key]];
    const reason = typeof raw === "string" && raw.trim() !== "" ? collapse(raw) : null;
    return { key, reason };
  });
}
