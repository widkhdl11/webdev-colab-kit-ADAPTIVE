import { describe, expect, it } from "vitest";
import { splitSentences } from "./split-sentences";

describe("splitSentences — 짧은 여러 문장 안내는 문장마다 줄(design-rules 29절)", () => {
  it("「요.」 뒤에서 나눈다", () => {
    expect(splitSentences("팬꾹에서 보이는 이름이에요. 12자까지 적을 수 있어요. 가입한 뒤 바꿀 수 있어요.")).toEqual([
      "팬꾹에서 보이는 이름이에요.",
      "12자까지 적을 수 있어요.",
      "가입한 뒤 바꿀 수 있어요.",
    ]);
  });

  it("괄호 뒤 마침표·숫자 안 마침표에서는 나누지 않는다", () => {
    expect(splitSentences("바로 끝나요(인스타그램은 프로페셔널 계정만). SOOP 은 확인해요. 1.5배예요.")).toEqual([
      "바로 끝나요(인스타그램은 프로페셔널 계정만). SOOP 은 확인해요.",
      "1.5배예요.",
    ]);
  });

  it("줄이 안 바뀌는 띄어쓰기(U+00A0)는 문장 사이로 보지 않는다", () => {
    expect(splitSentences("쓸\u00a0수\u00a0없어요.\u00a0다음")).toEqual(["쓸\u00a0수\u00a0없어요.\u00a0다음"]);
  });

  it("한 문장·빈 글은 그대로", () => {
    expect(splitSentences("한 문장이에요.")).toEqual(["한 문장이에요."]);
    expect(splitSentences("")).toEqual([]);
  });
});
