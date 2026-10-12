import { describe, expect, it } from "vitest";
import { accountLoginEmail, isTestAccountEmail, loginEmailCandidates, loginIdToEmail, SIGNUP_LOGIN_ID_PATTERN } from "./login-id";
import { TEST_SITE_ORIGINS } from "@/shared/lib/env/test-site";

describe("아이디 → 로그인 주소", () => {
  it("아이디는 영어 소문자·숫자·밑줄 4~30자이고, 시험 계정 주소 꼴로 바뀐다", () => {
    expect(loginIdToEmail("byeolbit_fan")).toBe("byeolbit_fan@fankkuk.test");
    expect(loginIdToEmail("  byeolbit_fan ")).toBe("byeolbit_fan@fankkuk.test");
  });

  it("꼴이 다른 아이디는 주소로 바꾸지 않는다 — 다른 주소를 끼워 넣지 못하게", () => {
    for (const bad of ["", "abc", "Byeolbit", "a@b.com", "byeol bit", "x".repeat(31), "byeolbit_fan@evil.com"]) {
      expect(loginIdToEmail(bad)).toBeNull();
      expect(accountLoginEmail(bad)).toBeNull();
      expect(loginEmailCandidates(bad, { NODE_ENV: "development" })).toEqual([]);
    }
  });

  it("INV-L6: 시험 계정 주소를 가려낸다", () => {
    expect(isTestAccountEmail("byeolbit_fan@fankkuk.test")).toBe(true);
    expect(isTestAccountEmail("BYEOLBIT_FAN@FANKKUK.TEST")).toBe(true);
    expect(isTestAccountEmail("someone@fankkuk.kr")).toBe(false);
    expect(isTestAccountEmail("x@fankkuk.test.evil.com")).toBe(false);
    expect(isTestAccountEmail("newfan@login.fankkuk.invalid")).toBe(false);
  });
});

describe("INV-U8: 가입한 계정의 로그인 주소", () => {
  it("INV-U8: 가입 계정은 메일이 갈 수 없는 예약 도메인 주소를 쓴다 — 사용자 이메일과 상관없다", () => {
    expect(accountLoginEmail("newfan")).toBe("newfan@login.fankkuk.invalid");
  });

  it("INV-U8 (S8): 운영에서는 가입 계정 주소 하나만 시도한다 — 시험 계정 주소는 만들지도 않는다", () => {
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL_ENV: "production" }]) {
      expect(loginEmailCandidates("newfan", env)).toEqual(["newfan@login.fankkuk.invalid"]);
      expect(loginEmailCandidates("byeolbit_fan", env).some(isTestAccountEmail)).toBe(false);
    }
  });

  it("INV-U8: 로컬에서는 가입 계정 주소 다음에 시험 계정 주소를 시도한다", () => {
    expect(loginEmailCandidates("byeolbit_fan", { NODE_ENV: "development" })).toEqual([
      "byeolbit_fan@login.fankkuk.invalid",
      "byeolbit_fan@fankkuk.test",
    ]);
  });

  it("INV-U6: 가입 아이디는 소문자·숫자·밑줄 4~20자", () => {
    for (const ok of ["abcd", "new_fan_01", "x".repeat(20)]) expect(SIGNUP_LOGIN_ID_PATTERN.test(ok)).toBe(true);
    for (const bad of ["abc", "x".repeat(21), "NewFan", "new-fan", "새팬친구"]) expect(SIGNUP_LOGIN_ID_PATTERN.test(bad)).toBe(false);
  });
});

// 변수로 둔다 — 이 함수들의 설정 형식에는 시험 사이트 칸이 없고, 넘겨도 쓰지 않는다는 것이 시험의 요점이다
const testSiteEnv = { NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: TEST_SITE_ORIGINS[0] };

describe("INV-TS2: 시험 사이트에서도 시험 계정 주소는 없다", () => {
  it("INV-TS2 (S2c, 실패경로): 시험 사이트라도 가입 계정 주소 하나만 시도한다", () => {
    expect(loginEmailCandidates("byeolbit_fan", testSiteEnv)).toEqual(["byeolbit_fan@login.fankkuk.invalid"]);
  });
});
