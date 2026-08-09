/**
 * 출처가 준 요약글 정리 — ingestion-ranking INV-S2·S3.
 *
 * 두 곳에 쓰인다: ① AI 요약을 만들 때의 **근거** ② AI 요약이 없을 때 화면에 대신 보여줄 글.
 *
 * 그래서 "글이 아닌 것"을 걸러내는 게 핵심이다. HN 의 description 은 `Article URL: …
 * Comments URL: …` 링크뿐인데(2026-08-09 실측), 이걸 근거로 넘기면 모델이 링크만 보고
 * 내용을 지어낸다 — INV-S1 이 금지하는 것이다.
 */

/** 화면 한두 문단 분량. 이보다 길면 요약글이 아니라 본문이다. */
const MAX_LENGTH = 1000;

/** 이보다 짧으면 근거로 쓸 수 없다("읽기" 같은 한 단어). */
const MIN_LENGTH = 8;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function toPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    // 태그를 공백으로 바꾸다 보면 문장부호 앞에 공백이 생긴다("여기 ." → "여기.").
    .replace(/\s+([.,!?;:)\]}])/g, "$1")
    .trim();
}

/**
 * HN 계열의 "링크 목록" description 인지.
 *
 * 태그를 벗기고 나면 URL 과 라벨만 남는다. 남은 글에서 주소·정형 라벨을 빼도
 * 뜻 있는 문장이 없으면 근거가 아니다.
 */
function isLinkListOnly(text: string): boolean {
  const rest = text
    .replace(/https?:\/\/\S+/g, " ")
    // hnrss 가 쓰는 정형 라벨. 이것들만 남은 글은 설명이 아니다.
    .replace(/#?\s*\b(?:Article|Comments?|Points?)\b\s*(?:URL)?\s*:?/gi, " ")
    // 남은 것이 글자·숫자인지만 본다. 공백은 남겨야 "첫 줄 둘째 줄" 이 붙어 짧아지지 않는다.
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return rest.length < MIN_LENGTH;
}

/** 쓸 수 있는 요약글이면 정리해서, 아니면 null. */
export function sourceExcerpt(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  const text = toPlainText(raw);
  if (text.length < MIN_LENGTH) return null;
  if (isLinkListOnly(text)) return null;

  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…` : text;
}
