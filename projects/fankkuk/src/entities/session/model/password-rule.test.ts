import { describe, expect, it } from "vitest";
import { PASSWORD_SAME_AS_ID, PASSWORD_TOO_LONG, PASSWORD_TOO_SHORT, PASSWORD_WEAK, newPasswordProblem } from "./password-rule";

// signup INV-U6 — 가입·재설정·바꾸기가 같이 쓰는 새 비밀번호 경계.
describe("INV-U6: 새 비밀번호는 8~72자, 영문·숫자·특수문자 중 3종류 이상, 아이디와 다르게", () => {
  it("INV-U6 (S6b): 세 종류를 섞은 8자와 72자는 받는다", () => {
    expect(newPasswordProblem("abc12!@#", "newfan")).toBeNull();
    expect(newPasswordProblem(`Aa1!${"y".repeat(68)}`, "newfan")).toBeNull();
    expect(newPasswordProblem("별빛pass12", "newfan")).toBeNull(); // 한글은 특수문자 쪽으로 센다
  });

  it("INV-U6 (S6, 실패경로): 7자·73자·두 종류만·아이디와 같음은 각각 그 문구로 거부", () => {
    expect(newPasswordProblem("ab1!cd2", "newfan")).toBe(PASSWORD_TOO_SHORT);
    expect(newPasswordProblem(`Aa1!${"y".repeat(69)}`, "newfan")).toBe(PASSWORD_TOO_LONG);
    for (const twoKinds of ["abcdefgh1", "abcdefgh!", "12345678!", "ABCDefgh"]) {
      expect(newPasswordProblem(twoKinds, "newfan"), twoKinds).toBe(PASSWORD_WEAK);
    }
    expect(newPasswordProblem("same_pw_01", "same_pw_01")).toBe(PASSWORD_SAME_AS_ID);
  });

  it("INV-U6 (실패경로): 공백은 특수문자로 세지 않는다", () => {
    expect(newPasswordProblem("abcd 1234", "newfan")).toBe(PASSWORD_WEAK);
  });
});
