import { describe, expect, it } from "vitest";
import { checkDetails } from "./signup-input";

const ok = {
  loginId: "newfan",
  email: "new.fan@example.com",
  password: "long-enough-pw",
  passwordConfirm: "long-enough-pw",
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
    expect(checkDetails({ ...ok, password: "123456789", passwordConfirm: "123456789" })?.field).toBe("password");
    expect(checkDetails({ ...ok, password: "x".repeat(73), passwordConfirm: "x".repeat(73) })?.field).toBe("password");
    expect(checkDetails({ ...ok, loginId: "samepassword", password: "samepassword", passwordConfirm: "samepassword" })?.field).toBe("password");
    expect(checkDetails({ ...ok, passwordConfirm: "different-pw" })?.field).toBe("passwordConfirm");
    expect(checkDetails({ ...ok, phone: "02-123-4567" })?.field).toBe("phone");
    expect(checkDetails({ ...ok, terms: { service: true, privacy: false } })?.field).toBe("terms");
  });
});
