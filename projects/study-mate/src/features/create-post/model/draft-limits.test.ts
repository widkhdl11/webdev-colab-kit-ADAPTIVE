import { describe, expect, it } from "vitest";
import { DRAFT_TIMEOUT_MS } from "./draft-limits";

// 스펙: docs/specs/ai-assist.md — 「숫자는 한 자리에서만 나온다」 표 (INV-G5)
//
// 추천 쪽 숫자 셋은 `features/recommend-studies/model/limits.test.ts` 가 든다.
// 값을 글자로 적는 이유도 거기에 있다 — 상수를 import 해서 비교하면 값이 바뀌어도 통과한다.

describe("초안의 모델 응답 상한", () => {
  it("INV-G5: 12초다 — 추천(8초)보다 길다", () => {
    // 성질이 다르다. 추천은 홈이 뜬 뒤 채워지는 구역이라 늦으면 그 자리가 비어 있을
    // 뿐인데, 초안은 **사용자가 단추를 누르고 기다리는 일**이라 도중에 포기하면
    // 아무것도 안 남는다. 만드는 글자 수도 훨씬 많다.
    expect(DRAFT_TIMEOUT_MS).toBe(12_000);
  });
});
