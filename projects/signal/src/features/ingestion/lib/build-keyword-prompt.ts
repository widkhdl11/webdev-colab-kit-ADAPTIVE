import { DATA_BOUNDARY, keywordRules } from "../model/prompt-text";

/**
 * 뱃지 키워드 추출에 쓰는 지시문 조립 (keywords-and-kinds INV-B1·B2·B3).
 *
 * `buildTopicPrompt` 와 같은 자리·같은 이유다 — 표기 기준은 사람이 취향으로 고치는 문장이라
 * 테스트가 옳고 그름을 못 잡고, 그래서 스크립트가 실제 모델에 물어 확인한다.
 * 그 스크립트가 지시문을 베껴 쓰면 고치는 순간 확인 대상과 실물이 갈린다.
 *
 * 이 함수는 **조립만** 한다. 무엇을 키워드로 볼지는 prompt-text.ts 가 정하고,
 * 응답을 읽는 것은 parse-keywords.ts 가 한다.
 *
 * 출력 형식 문장이 prompt-text.ts 가 아니라 여기 있는 이유: 그 파일 머리말대로
 * **기계가 의존하는 문장은 거기 두지 않는다.** 형식을 고치면 parse-keywords 도 같이
 * 고쳐야 하는데, "마음껏 고쳐도 되는 파일"에 있으면 그 짝이 조용히 깨진다.
 */
export function buildKeywordPrompt(
  knownFields: readonly string[],
  knownKinds: readonly string[],
): string {
  return [
    ...keywordRules(knownFields, knownKinds),
    DATA_BOUNDARY,
    '출력은 JSON 객체 하나뿐이다. 예: {"분야": ["코딩", "보안"], "사건종류": ["출시"]}. ' +
      "다른 말은 쓰지 않는다.",
  ]
    .map((rule) => `- ${rule}`)
    .join("\n");
}
