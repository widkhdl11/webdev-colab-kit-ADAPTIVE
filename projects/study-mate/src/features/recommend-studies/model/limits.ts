// 스펙 `docs/specs/ai-assist.md` 의 「숫자는 한 자리에서만 나온다」가 정한 값들.
// 스펙과 테스트가 이 상수를 가리킨다 — 값이 두 벌이 되면 한쪽이 조용히 낡는다.

/** 모델에 보내는 후보 모집글의 최대 개수 (INV-G3). */
export const CANDIDATE_MAX = 50;

/**
 * 모델 응답을 기다리는 상한 (INV-G5).
 *
 * **잰 값이 아니다.** 스펙이 그렇게 밝혀 두었다 — 실제 응답 시간을 재려면 키가 필요한데
 * 스펙을 쓸 때는 없었다. 재고 나서 이 값을 고친다.
 */
export const MODEL_TIMEOUT_MS = 8_000;

/** 한 사용자의 추천 순서를 다시 쓰는 기간 (INV-G7). */
export const RECOMMENDATION_REUSE_MS = 60_000;

/** 화면의 추천 구역이 그리는 카드 수. 후보 상한과 다른 값이다 — 후보는 고르는 대상이고 이건 결과다. */
export const RECOMMENDATION_SHOWN = 3;
