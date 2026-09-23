import { describe, expect, it } from "vitest";
import { sourcePresentation } from "./presentation";

describe("출처를 화면에 부르는 법", () => {
  it("피드가 준 이름(`Openai`)이 아니라 설정의 이름을 쓴다", () => {
    expect(sourcePresentation("openai-blog", "Openai").displayName).toBe("OpenAI");
  });

  it("GeekNews 는 정리한 사람 이름(Hada)으로 부르고 원문은 「Hada 정리, 한국어」다", () => {
    expect(sourcePresentation("geeknews", "Hada")).toEqual({
      displayName: "Hada",
      originalNote: "Hada 정리, 한국어",
    });
  });

  it("영어 소스의 원문은 「영어」다", () => {
    expect(sourcePresentation("theverge", "The Verge").originalNote).toBe("영어");
  });

  it("실패경로: 설정에 없는 소스는 항목의 이름을 쓰고 원문 성격을 지어내지 않는다", () => {
    expect(sourcePresentation("gone", "옛 소스")).toEqual({ displayName: "옛 소스", originalNote: null });
  });
});
