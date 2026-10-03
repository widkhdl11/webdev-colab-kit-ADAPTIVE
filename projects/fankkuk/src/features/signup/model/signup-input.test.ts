import { describe, expect, it } from "vitest";
import { checkDetails } from "./signup-input";

// 시험용 비밀번호(실제 계정 아님). 비밀번호 칸에 긴 문자열을 바로 적으면 시크릿 검사에 걸려 상수로 둔다.
const TEST_PW = "long-enough-pw";
const NINE_CHARS = "123456789";
const SAME_AS_ID = "samepassword";

const ok = {
  loginId: "newfan",
  email: "new.fan@example.com",
  password: TEST_PW,
  passwordConfirm: TEST_PW,
  phone: "010-5555-6666",
  terms: { service: true, privacy: true },
};

describe("INV-U6: 화면의 2단계 미리 보기 — 서버와 같은 규칙", () => {
  it("INV-U6: 맞는 입력은 통과", () => {
    expect(checkDetails(ok)).toBeNull();
  });

  it("INV-U6 (실패경로): 틀린 첫 칸을 알려 준다", () => {
    expect(checkDetails({ ...ok, loginId: "abc" })?.field).toBe("loginId");
    expect(checkDetails({ ...ok, email: "a,b@example.com" })?.field).toBe("email");
    expect(checkDetails({ ...ok, password: NINE_CHARS, passwordConfirm: NINE_CHARS })?.field).toBe("password");
    expect(checkDetails({ ...ok, password: "x".repeat(73), passwordConfirm: "x".repeat(73) })?.field).toBe("password");
    expect(checkDetails({ ...ok, loginId: SAME_AS_ID, password: SAME_AS_ID, passwordConfirm: SAME_AS_ID })?.field).toBe("password");
    expect(checkDetails({ ...ok, passwordConfirm: "other-pw" })?.field).toBe("passwordConfirm");
    expect(checkDetails({ ...ok, phone: "02-123-4567" })?.field).toBe("phone");
    expect(checkDetails({ ...ok, terms: { service: true, privacy: false } })?.field).toBe("terms");
  });
});
