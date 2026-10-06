import { describe, expect, it } from "vitest";
import { bioHasVerificationCode } from "./bio-code";

// INV-V16: 코드는 `FK-XXXX-NN` 꼴 그대로 일치해야 한다 — 소개란 글 안에서 낱말 하나로.
describe("소개란에서 인증 코드 찾기 (INV-V16)", () => {
  const CODE = "FK-7H3Q-92";

  it("INV-V16: 소개란 글 어디에 있든 코드가 그대로 있으면 찾는다", () => {
    expect(bioHasVerificationCode(CODE, CODE)).toBe(true);
    expect(bioHasVerificationCode(`안녕하세요 꿀단지예요\n팬꾹 확인 ${CODE} 입니다`, CODE)).toBe(true);
    expect(bioHasVerificationCode(`(${CODE})`, CODE)).toBe(true);
    expect(bioHasVerificationCode(`확인코드:${CODE}.`, CODE)).toBe(true);
  });

  it("INV-V16 (실패경로): 코드가 없거나 일부만 있으면 못 찾음", () => {
    expect(bioHasVerificationCode("", CODE)).toBe(false);
    expect(bioHasVerificationCode("안녕하세요 꿀단지예요", CODE)).toBe(false);
    expect(bioHasVerificationCode("FK-7H3Q-9", CODE)).toBe(false);
    expect(bioHasVerificationCode("FK-7H3Q 92", CODE)).toBe(false);
  });

  it("INV-V16 (실패경로): 더 긴 낱말 안에 끼어 있으면 같은 코드가 아니다", () => {
    expect(bioHasVerificationCode("FK-7H3Q-923", CODE)).toBe(false);
    expect(bioHasVerificationCode("XFK-7H3Q-92", CODE)).toBe(false);
    expect(bioHasVerificationCode("FK-7H3Q-92-1", CODE)).toBe(false);
    expect(bioHasVerificationCode("aFK-7H3Q-92", CODE)).toBe(false);
  });

  it("INV-V16 (실패경로): 글자 크기가 다르면 같은 코드가 아니다 — 꼴 그대로 일치", () => {
    expect(bioHasVerificationCode("fk-7h3q-92", CODE)).toBe(false);
    expect(bioHasVerificationCode("FK-7h3Q-92", CODE)).toBe(false);
  });

  it("INV-V16 (실패경로): 찾을 코드가 FK-XXXX-NN 꼴이 아니면 무엇이든 못 찾음 — 빈 코드가 아무 글에나 맞지 않게", () => {
    expect(bioHasVerificationCode("아무 글", "")).toBe(false);
    expect(bioHasVerificationCode("FK-.*", "FK-.*")).toBe(false);
    expect(bioHasVerificationCode("FK-ABCD-1", "FK-ABCD-1")).toBe(false);
  });
});
