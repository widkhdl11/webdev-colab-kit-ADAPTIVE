import type { PostSummary } from "@/entities/post";

/**
 * 모델 없이 정하는 순서 (INV-G5 · G6).
 *
 * 근거가 하나도 없을 때(가입 직후)와 모델을 못 썼을 때(지연·실패) **같은 순서**를 쓴다.
 * 두 경우에 다른 규칙을 두면 화면이 왜 달라졌는지 아무도 설명 못 한다.
 *
 * **같은 입력에 언제나 같은 답이어야 한다.** 흔들리면 새로고침마다 순서가 바뀌어 사용자가
 * 아까 본 것을 못 찾는다. 그래서 마지막 가름을 id 로 둔다 — 좋아요와 시각이 같을 때
 * 정렬 구현이 순서를 정하게 두지 않는다.
 */
export function ruleOrder(candidates: readonly PostSummary[]): readonly PostSummary[] {
  return [...candidates].sort((a, b) => {
    if (a.likesCount !== b.likesCount) return b.likesCount - a.likesCount;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });
}
