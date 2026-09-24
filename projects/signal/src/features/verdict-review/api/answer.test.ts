import { describe, expect, it, vi } from "vitest";
import type { ReviewStore } from "./review-store";
import { answerVerdict } from "./answer";

/**
 * 답 하나의 입력 검사 — docs/specs/verdict-review.md INV-VR3·VR9.
 * 닫혔나·방향이 판정에 맞나는 DB 함수가 보고(통합 테스트), 여기서는 그 앞의 문을 본다:
 * 배포 환경이면 거부 · 모양이 틀리면 DB 까지 안 간다.
 */

const WEEK = "2026-W40";
const ITEM = "3f0c2d1e-7b6a-4c5d-9e8f-0a1b2c3d4e5f";

function store() {
  const answer = vi.fn(async () => ({ ok: true as const }));
  return { s: { answer } as unknown as ReviewStore, answer };
}

describe("답 입력 (INV-VR3·VR9)", () => {
  it("INV-VR9: 이 PC 의 개발 서버가 아니면 무조건 거부하고 DB 에 안 간다 — 서버 액션은 직접 POST 로 부를 수 있다", async () => {
    const { s, answer } = store();
    expect(await answerVerdict(s, { week: WEEK, itemId: ITEM, answer: "correct" }, { isLocal: false })).toEqual({ ok: false, error: "forbidden" });
    expect(answer).not.toHaveBeenCalled();
  });

  it("INV-VR3: 맞는 모양이면 DB 함수로 넘긴다 — 방향 없는 틀리다는 null 로", async () => {
    const { s, answer } = store();
    await answerVerdict(s, { week: WEEK, itemId: ITEM, answer: "wrong" }, { isLocal: true });
    expect(answer).toHaveBeenCalledWith(WEEK, ITEM, "wrong", null);
    await answerVerdict(s, { week: WEEK, itemId: ITEM, answer: "wrong", direction: "wrong_reason" }, { isLocal: true });
    expect(answer).toHaveBeenLastCalledWith(WEEK, ITEM, "wrong", "wrong_reason");
  });

  const bad: [string, unknown, string][] = [
    ["모르는 칸", { week: WEEK, itemId: ITEM, answer: "correct", note: "x" }, "bad_input"],
    ["모르는 답", { week: WEEK, itemId: ITEM, answer: "maybe" }, "bad_input"],
    ["주차 모양이 아님(경로 조각)", { week: "../x", itemId: ITEM, answer: "correct" }, "bad_input"],
    ["글 id 가 uuid 가 아님", { week: WEEK, itemId: "1 or 1=1", answer: "correct" }, "bad_input"],
    ["「안 고름」을 직접 보냄", { week: WEEK, itemId: ITEM, answer: "wrong", direction: "unknown" }, "bad_input"],
    ["맞다에 방향", { week: WEEK, itemId: ITEM, answer: "correct", direction: "wrong_reason" }, "bad_direction"],
    ["객체가 아님", "correct", "bad_input"],
  ];
  for (const [name, raw, error] of bad) {
    it(`INV-VR3: ${name} → 거부, DB 에 안 간다`, async () => {
      const { s, answer } = store();
      expect(await answerVerdict(s, raw, { isLocal: true })).toEqual({ ok: false, error });
      expect(answer).not.toHaveBeenCalled();
    });
  }
});
