import { describe, expect, it } from "vitest";
import { topicVerdict } from "./topic-verdict";

/**
 * 모델 응답 → 주제 판정 (INV-F1·F3).
 *
 * 이 판정이 api/ports.ts 안에 인라인으로 있던 동안 **테스트가 하나도 없었고**,
 * 그래서 응답이 잘려 빈 문자열이 오는 경로를 아무도 못 봤다(2026-08-12 실측:
 * `max_tokens: 5` 에서 5토큰을 전부 thinking 에 써서 텍스트가 0글자).
 */
describe("topicVerdict — INV-F1 주제 판정", () => {
  it('INV-F1: "no" 라고 답하면 주제 밖이다', () => {
    expect(topicVerdict({ stopReason: "end_turn", text: "no" })).toBe("off");
    expect(topicVerdict({ stopReason: "end_turn", text: "  NO\n" })).toBe("off");
  });

  it("INV-F1: yes 면 주제 안이다", () => {
    expect(topicVerdict({ stopReason: "end_turn", text: "yes" })).toBe("on");
    expect(topicVerdict({ stopReason: "end_turn", text: "Yes." })).toBe("on");
  });

  it("INV-F3 실패경로: 응답이 잘리면 판정으로 치지 않는다", () => {
    // 여기가 이번에 드러난 자리다. 잘린 응답은 **판정을 못 한 것**이지 "주제 안"이 아니다.
    expect(topicVerdict({ stopReason: "max_tokens", text: "" })).toBe("unjudged");
    // 잘린 응답에 "no" 가 섞여 있어도 믿지 않는다 — 생각을 끝내기 전에 뱉은 말이다.
    // 실측으로 확인됐다: 같은 제목이 16토큰에서 "no", 64토큰에서 "yes" 였다.
    expect(topicVerdict({ stopReason: "max_tokens", text: "no" })).toBe("unjudged");
  });

  it("INV-F3 실패경로: 형식이 깨진 응답도 판정으로 치지 않는다", () => {
    expect(topicVerdict({ stopReason: "end_turn", text: "" })).toBe("unjudged");
    expect(topicVerdict({ stopReason: "end_turn", text: "잘 모르겠습니다" })).toBe("unjudged");
    expect(topicVerdict({ stopReason: null, text: "" })).toBe("unjudged");
  });

  it('INV-F1: "nothing"·"normal" 처럼 no 로 시작하는 다른 말에 걸리지 않는다', () => {
    // startsWith 로 보면 "nothing to do with AI" 같은 문장이 우연히 거절로 읽힌다.
    expect(topicVerdict({ stopReason: "end_turn", text: "nothing here" })).not.toBe("off");
    expect(topicVerdict({ stopReason: "end_turn", text: "normal" })).not.toBe("off");
  });

  it("INV-F3: 거르는 답은 하나뿐이다", () => {
    // 나머지가 전부 off 로 떨어지면 판정 실패가 곧 삭제가 된다 — 그게 이 불변식이 막는 것이다.
    for (const text of ["", "yes", "maybe", "off-topic 인 것 같다", "1", "네"]) {
      expect(topicVerdict({ stopReason: "end_turn", text })).not.toBe("off");
    }
  });
});
