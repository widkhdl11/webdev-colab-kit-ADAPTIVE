import { describe, expect, it } from "vitest";
import { CANDIDATE_MAX, MODEL_TIMEOUT_MS, RECOMMENDATION_REUSE_MS } from "./limits";

// 스펙: docs/specs/ai-assist.md — 「숫자는 한 자리에서만 나온다」 표
//
// **상수를 import 해서 비교하는 검사는 상수를 고정하지 못한다.** 다른 검사들이
// `CANDIDATE_MAX` 를 가져다 쓰므로 그 값이 5000 이 돼도 전부 초록불이다. 같은 이유로
// `MODEL_TIMEOUT_MS` 를 800초로 바꿔도 아무 검사가 안 깨졌다(2026-09-10 test-auditor).
// 2026-08-10 회고의 「MAX_RATIO 를 10→100 으로 바꿔도 전부 통과」와 같은 모양이다.
//
// 초안 쪽 상한(20초)은 다른 슬라이스라 그쪽 검사가 든다 —
// `features/create-post/model/draft-limits.test.ts`.
//
// 그래서 여기서는 **스펙의 표를 근거로 값을 글자로 적는다.** 값을 바꾸려면 이 파일과
// 스펙을 같이 고쳐야 하고, 그 두 자리가 사람이 값을 다시 보는 지점이 된다.

describe("스펙의 숫자 표", () => {
  it("INV-G3: 후보 모집글 상한은 50건이다", () => {
    expect(CANDIDATE_MAX).toBe(50);
  });

  it("INV-G5: 추천의 모델 응답 상한은 8초다", () => {
    expect(MODEL_TIMEOUT_MS).toBe(8_000);
  });

  it("INV-G7: 추천 재사용 시간은 60초다", () => {
    expect(RECOMMENDATION_REUSE_MS).toBe(60_000);
  });
});
