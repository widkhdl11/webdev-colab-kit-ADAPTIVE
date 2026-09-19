/**
 * 모델 응답 → 주제 판정 (content-selection INV-F1·F3).
 *
 * 순수 함수로 뺀 이유: 이 판정이 포트 구현 안에 인라인으로 있는 동안 테스트가 하나도 없었고,
 * 그래서 **응답이 잘려 텍스트가 0글자로 오는 경로**를 아무도 못 봤다. 2026-08-12 실측 —
 * `max_tokens: 5` 로 부르면 모델이 5토큰을 전부 thinking 블록에 쓰고 텍스트를 못 낸다.
 *
 * 더 나쁜 것은 잘린 답 자체가 틀린다는 점이다: 같은 제목에 max_tokens 16 이면 "no",
 * 64(생각을 끝냄)면 "yes" 였다. 그래서 잘린 응답은 **답이 아니라 판정 실패로 다룬다.**
 */

export interface TopicResponse {
  /** Anthropic 응답의 stop_reason. 잘렸으면 "max_tokens". */
  stopReason: string | null;
  /** 텍스트 블록만 이어 붙인 것. */
  text: string;
}

/**
 * `unjudged` 는 "주제 안"이 아니다. 둘 다 결국 통과시키지만(INV-F3) **이유가 다르고**,
 * 이유를 안 갈라 두면 판정이 전부 실패하는 날에도 리포트가 "거른 건수 0"으로 정상처럼 보인다.
 */
export type TopicVerdict = "on" | "off" | "unjudged";

export function topicVerdict(res: TopicResponse): TopicVerdict {
  if (res.stopReason === "max_tokens") return "unjudged";

  // 낱말 하나로 본다. `startsWith("no")` 로 보면 "nothing to do with AI" 가 거절로 읽힌다.
  const first = res.text.trim().toLowerCase().split(/[^a-z]+/).filter(Boolean)[0];
  if (first === "no") return "off";
  if (first === "yes") return "on";
  // 형식이 깨진 응답은 답으로 치지 않는다 — 거르는 쪽으로 기울면 안 된다(INV-F3).
  return "unjudged";
}
