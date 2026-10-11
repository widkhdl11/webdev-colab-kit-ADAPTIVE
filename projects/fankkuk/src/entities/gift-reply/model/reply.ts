import { charCount } from "@/shared/lib/validation/char-count";
import { HIDDEN_CHAR } from "@/shared/lib/validation/hidden-char";

// 받았어요 · 감사 답장 (docs/specs/gift-reply.md). DB 와 같은 코드·글·한도를 쓴다 — 화면은 먼저 꼴을 보고, DB 저장 함수가 다시 검사한다.
// 답장 = 정해진 문구 하나(코드로 저장) + 선택으로 한 줄(앞뒤 공백을 뺀 0~80자, 줄바꿈 없음). 한 줄이 크리에이터가 자유롭게 쓰는 유일한 칸이다(INV-G3).

/** INV-G3: 정해진 문구 다섯 — 스펙 순서. DB 는 코드만 받는다. */
export const REPLY_PHRASES = ["thanks", "love_it", "will_use", "cheered", "touched"] as const;
export type ReplyPhrase = (typeof REPLY_PHRASES)[number];

export const REPLY_PHRASE_TEXT: Record<ReplyPhrase, string> = {
  thanks: "잘 받았어요, 고마워요",
  love_it: "너무 마음에 들어요",
  will_use: "잘 쓸게요",
  cheered: "덕분에 힘이 났어요",
  touched: "정성이 느껴져서 감동이에요",
};

export function isReplyPhrase(v: unknown): v is ReplyPhrase {
  return typeof v === "string" && (REPLY_PHRASES as readonly string[]).includes(v);
}

/** INV-G3: 한 줄 최대 글자 수(코드 포인트 — DB char_length 와 같은 기준). */
export const REPLY_LINE_MAX = 80;

/** 앞뒤 공백을 뺀 한 줄. 비면 null(한 줄 없음). */
export function normalizeReplyLine(line: string | null | undefined): string | null {
  const t = (line ?? "").trim();
  return t === "" ? null : t;
}

/**
 * 한 줄의 꼴 문제 — 길이·줄바꿈만 본다. 금칙어·연락처 꼴은 DB 가 업계 기본 필터(creator-tags INV-T7)로 본다
 * (금칙어 목록을 화면에 내려보내지 않는다).
 */
export function replyLineProblem(line: string | null): "too_long" | "forbidden_chars" | null {
  if (line === null) return null;
  if (charCount(line) > REPLY_LINE_MAX) return "too_long";
  // 줄바꿈·제어 문자·보이지 않는 글자 — 한 줄 소개와 같은 목록(DB 저장 함수도 같은 목록으로 거부한다)
  if (HIDDEN_CHAR.test(line) || /[\u2028\u2029]/.test(line)) return "forbidden_chars";
  return null;
}

/** 크리에이터 화면의 상자 답장 상태 — 아무것도 없음 · 확인만 · 답장함 · 답장 지움. */
export type ReplyState = "none" | "confirmed" | "replied" | "deleted";

/** 탈퇴한 크리에이터의 답장은 팬의 기록으로 남고 이름 칸이 비어 온다(스펙 「스스로 정한 것」, 사용자 답 ⑭). */
export const WITHDRAWN_CREATOR_NAME = "탈퇴한 크리에이터";

export function creatorNameOrWithdrawn(name: string | null): string {
  return name ?? WITHDRAWN_CREATOR_NAME;
}

/** INV-G7: 팬이 닉네임 보이기를 고르지 않은 답장의 이름 자리. */
export const ANONYMOUS_FAN = "익명의 팬";

// ── 공유 (INV-G9) ──────────────────────────────────

/** X 계정 꼴 — 영문·숫자·밑줄 1~15자(X 의 아이디 규칙, 업계 표준). DB 와 같다. */
export const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

/** 입력한 X 계정 — 앞뒤 공백과 맨 앞 「@」 하나를 뗀다. 비면 null(등록 안 함). 꼴 검사는 따로. */
export function normalizeXHandle(input: string): string | null {
  const t = input.trim().replace(/^@/, "");
  return t === "" ? null : t;
}

/** 공유 글에 늘 붙는 문구. */
export const SHARE_HASHTAG = "#팬꾹";

/**
 * X 글쓰기 창에 채울 글. 「#팬꾹」, 그리고 크리에이터가 X 계정을 등록하고 태그를 허용한 경우만 「@계정」(INV-G9).
 * xTag 는 DB 가 두 조건을 모두 만족할 때만 주는 값이다 — 꼴이 아니면 붙이지 않는다.
 */
export function shareTextOf(xTag: string | null): string {
  return xTag && X_HANDLE_PATTERN.test(xTag) ? `${SHARE_HASHTAG} @${xTag}` : SHARE_HASHTAG;
}

/** X 글쓰기 창 주소 — 글만 채운다(이미지는 팬이 내려받아 붙인다). */
export function xIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

/** 공유 카드 크기 — 정사각형(1080×1080)과 X 용 가로(1200×675). */
export const CARD_SIZES = { square: { width: 1080, height: 1080 }, wide: { width: 1200, height: 675 } } as const;
export type CardSize = keyof typeof CARD_SIZES;

export function isCardSize(v: unknown): v is CardSize {
  return v === "square" || v === "wide";
}

/**
 * 카드 답장 글자 크기 — 문구와 한 줄을 합친 길이가 길수록 줄인다(DECISIONS 2026-10-11 「길이에 따라 줄인다」).
 * 시안 크기(정사각 문구 80·한 줄 42, 가로 문구 64·한 줄 34)가 가장 크고, 한 줄 80자를 꽉 채워도 판 안에 들어가는 크기까지 내려간다.
 */
export function cardTextSizes(phraseText: string, line: string | null, size: CardSize): { phrase: number; line: number } {
  const total = charCount(phraseText) + (line ? charCount(line) : 0);
  const base = size === "square" ? { phrase: 80, line: 42 } : { phrase: 64, line: 34 };
  const scale = total <= 30 ? 1 : total <= 55 ? 0.85 : total <= 80 ? 0.72 : 0.62;
  // 짝수 픽셀로 맞춘다(design-rules 간격 규칙과 같은 단위)
  const even = (n: number) => Math.round(n / 2) * 2;
  return { phrase: even(base.phrase * scale), line: even(base.line * scale) };
}

/** 카드·모음에 쓰는 날짜 — 「2026.10.05」. YYYY-MM-DD 만 받는다(시각은 화면에 오지 않는다, INV-G6). */
export function dotDate(isoDate: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate.replaceAll("-", ".") : "";
}

/** 「10월 8일」 — YYYY-MM-DD 만 받는다. */
export function monthDayText(isoDate: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(isoDate);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : "";
}

/**
 * 크리에이터 화면에서 그 상자에 할 수 있는 일(INV-G2·G4). 아무것도 없으면 받았어요(답장과 함께 또는 확인만),
 * 확인만 했으면 답장 더하기, 답장했으면 지우기. 지운 상자는 아무것도 없다(다시 쓰지 않는다).
 */
export function replyActionsOf(state: ReplyState): { confirm: boolean; addReply: boolean; remove: boolean } {
  return { confirm: state === "none", addReply: state === "confirmed", remove: state === "replied" };
}
