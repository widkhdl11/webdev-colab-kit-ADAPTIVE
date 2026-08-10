import { describe, expect, it } from "vitest";
import { displayTitle } from "./display-title";

describe("displayTitle (INV-S6)", () => {
  it("번역문이 있으면 번역문을 보여주고 원문 제목을 함께 돌려준다", () => {
    const t = displayTitle({ title: "Anthropic ships X", titleKo: "앤트로픽이 X를 내놨다" });
    expect(t.text).toBe("앤트로픽이 X를 내놨다");
    // 원문을 잃지 않는 게 이 함수의 존재 이유다 — 상세가 병기할 수 있어야 한다.
    expect(t.original).toBe("Anthropic ships X");
    expect(t.isTranslated).toBe(true);
  });

  it("INV-S6 실패경로: 번역문이 없으면 원문 제목을 보여주고 병기하지 않는다", () => {
    const t = displayTitle({ title: "Anthropic ships X", titleKo: null });
    expect(t.text).toBe("Anthropic ships X");
    expect(t.isTranslated).toBe(false);
    // 같은 문장을 두 번 보여주면 안 된다.
    expect(t.original).toBeNull();
  });

  it("INV-S6 실패경로: 번역문이 공백뿐이면 없는 것으로 본다", () => {
    // 모델이 빈 문자열을 돌려줄 수 있다. 그걸 제목으로 쓰면 카드에 제목이 사라진다.
    const t = displayTitle({ title: "Anthropic ships X", titleKo: "   " });
    expect(t.text).toBe("Anthropic ships X");
    expect(t.isTranslated).toBe(false);
  });

  it("INV-S6: 번역문이 원문과 같으면(이미 한국어) 병기하지 않는다", () => {
    const t = displayTitle({ title: "국내 AI 소식", titleKo: "국내 AI 소식" });
    expect(t.text).toBe("국내 AI 소식");
    expect(t.original).toBeNull();
  });
});

describe("displayTitle — 공백 처리", () => {
  it("원문 제목에 공백이 붙어도 같은 값으로 본다", () => {
    // 트림을 지우면 "국내 AI 소식" 과 " 국내 AI 소식 " 이 다른 값이 돼 원문을 병기한다.
    const t = displayTitle({ title: " 국내 AI 소식 ", titleKo: "국내 AI 소식" });
    expect(t.original).toBeNull();
    expect(t.isTranslated).toBe(false);
  });
});
