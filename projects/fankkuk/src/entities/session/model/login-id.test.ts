import { describe, expect, it } from "vitest";
import { isTestAccountEmail, loginIdToEmail } from "./login-id";

describe("아이디 → 로그인 주소", () => {
  it("아이디는 영어 소문자·숫자·밑줄 4~30자이고, 정해진 주소 꼴로 바뀐다", () => {
    expect(loginIdToEmail("byeolbit_fan")).toBe("byeolbit_fan@fankkuk.test");
    expect(loginIdToEmail("  byeolbit_fan ")).toBe("byeolbit_fan@fankkuk.test");
  });

  it("꼴이 다른 아이디는 주소로 바꾸지 않는다 — 다른 주소를 끼워 넣지 못하게", () => {
    for (const bad of ["", "abc", "Byeolbit", "a@b.com", "byeol bit", "x".repeat(31), "byeolbit_fan@evil.com"]) {
      expect(loginIdToEmail(bad)).toBeNull();
    }
  });

  it("INV-L6: 시험 계정 주소를 가려낸다", () => {
    expect(isTestAccountEmail("byeolbit_fan@fankkuk.test")).toBe(true);
    expect(isTestAccountEmail("BYEOLBIT_FAN@FANKKUK.TEST")).toBe(true);
    expect(isTestAccountEmail("someone@fankkuk.kr")).toBe(false);
    expect(isTestAccountEmail("x@fankkuk.test.evil.com")).toBe(false);
  });
});
