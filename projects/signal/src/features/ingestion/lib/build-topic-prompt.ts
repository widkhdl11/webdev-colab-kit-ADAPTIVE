import { DATA_BOUNDARY, TOPIC_SCOPE } from "../model/prompt-text";

/**
 * 주제 판정에 쓰는 지시문 조립 (content-selection INV-F1).
 *
 * 포트 구현 안에 인라인으로 두지 않는 이유는 `topicVerdict` 를 뺀 이유와 같다 —
 * 인라인인 동안에는 **바깥에서 부를 수가 없다.** 판정 기준(TOPIC_SCOPE)은 사람이 취향으로
 * 고치는 문장이라 테스트가 옳고 그름을 못 잡고, 그래서 `npm run check:topic` 이 실제 모델에
 * 물어 확인한다. 그 스크립트가 지시문을 베껴 쓰면 고치는 순간 확인 대상과 실물이 갈린다.
 *
 * 이 함수 자체는 **조립만** 한다. 무엇이 주제 안인지는 prompt-text.ts 가 정한다.
 */
export function buildTopicPrompt(): string {
  return [
    TOPIC_SCOPE,
    "제목만 보고 판단한다.",
    DATA_BOUNDARY,
    '출력은 "yes" 또는 "no" 한 단어뿐. 다른 말은 쓰지 않는다.',
  ]
    .map((rule) => `- ${rule}`)
    .join("\n");
}
