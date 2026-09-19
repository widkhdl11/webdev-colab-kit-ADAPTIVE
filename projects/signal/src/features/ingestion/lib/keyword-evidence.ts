import { KEYWORD_EVIDENCE_LIMIT } from "./budgets";

/**
 * 키워드 호출에 넘길 근거를 고른다 — 출처 요약글이 먼저, 없으면 본문 (badge-keywords INV-B1).
 *
 * **2026-08-31 에 `api/ports.ts` 에서 내려왔다.** 순수 계산인데 `server-only` 파일에 있어서
 * 유닛이 로드조차 못 했다 — 상한을 12로 바꾸든 두 재료의 우선순위를 뒤집든 전 스위트가
 * green 이었다(rules/tdd.md "테스트가 못 읽는 자리").
 *
 * 요약글을 먼저 쓰는 이유: 2026-08-15·08-30 실측이 그 재료로 이뤄졌고, 이미 사람이 쓴
 * 요약이라 앞부분에 요지가 몰려 있다. 본문은 머리말·목차가 앞에 오는 경우가 있다.
 *
 * 태그를 지우는 것은 **프롬프트에 실을 글자를 만드는 것**이지 화면에 그리는 게 아니다 —
 * 안전은 `fenceData` 가 담당한다. 여기서는 표시 문자만 남기면 된다.
 */
export function keywordEvidence(sourceExcerpt: string, contentHtml: string): string {
  const text = sourceExcerpt.trim() || contentHtml.replace(/<[^>]*>/g, " ");
  return text.replace(/\s+/g, " ").trim().slice(0, KEYWORD_EVIDENCE_LIMIT);
}
