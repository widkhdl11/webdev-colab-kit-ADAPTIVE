import { afterEach, describe, expect, it, vi } from "vitest";
import {
  choosePhoneVerifier,
  hashPhoneCode,
  FAKE_PHONE_CODE,
  makePhoneCode,
  readPhoneCodeSecret,
  readSmsProviderConfig,
} from "./verifier";
import { TEST_SITE_ORIGINS } from "@/shared/lib/env/test-site";

afterEach(() => vi.restoreAllMocks());

describe("INV-U9: 가짜 문자 창구는 운영에서 켜질 수 없다", () => {
  it("INV-U9 (S9): 운영 표시가 있으면 문자 창구가 없다 — 가짜로 넘어가지 않는다", () => {
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL_ENV: "production" }]) {
      expect(choosePhoneVerifier(env)).toBeNull();
    }
  });

  it("INV-U9 (S9): 운영에서 문자 대행사 설정을 넣어도 연결 전에는 창구가 없다 — 가짜도 나오지 않는다", () => {
    const env = { NODE_ENV: "production", SMS_API_KEY: "k", SMS_API_SECRET: "s", SMS_SENDER_NUMBER: "0212345678", FK_FAKE_PHONE_VERIFIER: "1" };
    expect(choosePhoneVerifier(env)).toBeNull();
  });

  it("INV-U9: 로컬에서는 가짜 문자 창구가 나온다", () => {
    expect(choosePhoneVerifier({ NODE_ENV: "development" })?.kind).toBe("fake");
    expect(choosePhoneVerifier({ NODE_ENV: "test" })?.kind).toBe("fake");
  });

  it("INV-U15: 가짜 창구는 문자를 보내지 않고, 기록에는 번호 끝 4자리와 「보냄」만 — 본문·인증번호·전체 번호가 없다", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await choosePhoneVerifier({ NODE_ENV: "development" })!.send("01055556666", "[팬꾹] 인증번호 000000 (3분 안에 입력해 주세요)");
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]![0]);
    expect(line).toContain("6666");
    expect(line).toContain("보냄");
    expect(line).not.toContain("000000");
    expect(line).not.toContain("5555");
  });

  it("INV-U9: 가짜 창구(로컬·시험 사이트)만 고정 인증번호 000000 을 쓴다", () => {
    expect(FAKE_PHONE_CODE).toBe("000000");
    expect(choosePhoneVerifier({ NODE_ENV: "development" })?.fixedCode).toBe("000000");
    expect(choosePhoneVerifier({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: TEST_SITE_ORIGINS[0] })?.fixedCode).toBe("000000");
  });
});

describe("INV-TS2: 시험 사이트에서는 가짜 문자 창구가 열린다", () => {
  it("INV-TS2 (S2): 시험 사이트면 운영 빌드라도 가짜 창구가 나온다", () => {
    expect(choosePhoneVerifier({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: TEST_SITE_ORIGINS[0] })?.kind).toBe("fake");
  });

  it("INV-TS2 (S2b, 실패경로): 시험 주소가 아니면 설정값이 있어도 창구가 없다", () => {
    expect(choosePhoneVerifier({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: "https://fankkuk.com" })).toBeNull();
  });
});

describe("INV-U15: 인증번호 만들기·해시", () => {
  it("INV-U15: 6자리 숫자다(앞자리 0 포함)", () => {
    for (let i = 0; i < 200; i += 1) expect(makePhoneCode()).toMatch(/^\d{6}$/);
  });

  it("INV-U15: 해시는 비밀 값·번호표·인증번호가 하나라도 다르면 달라지고, 원문 6자리가 들어 있지 않다", () => {
    const secret = "s".repeat(40);
    const base = hashPhoneCode(secret, "id-1", "123456");
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(base).not.toContain("123456");
    expect(hashPhoneCode(secret, "id-1", "123456")).toBe(base);
    expect(hashPhoneCode(secret, "id-2", "123456")).not.toBe(base);
    expect(hashPhoneCode(secret, "id-1", "123457")).not.toBe(base);
    expect(hashPhoneCode("t".repeat(40), "id-1", "123456")).not.toBe(base);
  });

  it("INV-U15 (실패경로): 운영에서 해시 비밀 값이 없거나 짧으면 시작하지 않는다", () => {
    expect(() => readPhoneCodeSecret({ NODE_ENV: "production" })).toThrow(/PHONE_CODE_HASH_SECRET/);
    expect(() => readPhoneCodeSecret({ NODE_ENV: "production", PHONE_CODE_HASH_SECRET: "short" })).toThrow();
    expect(readPhoneCodeSecret({ NODE_ENV: "production", PHONE_CODE_HASH_SECRET: "x".repeat(32) })).toBe("x".repeat(32));
  });

  it("INV-U15 (실패경로): 공개 환경 변수로 넣었으면 시작하지 않는다", () => {
    expect(() => readPhoneCodeSecret({ NODE_ENV: "development", NEXT_PUBLIC_PHONE_CODE_HASH_SECRET: "x".repeat(40) })).toThrow();
  });

  it("로컬에서 비밀 값이 없으면 실행 동안 같은 값을 쓴다 — 요청과 확인의 해시가 맞아야 한다", () => {
    const a = readPhoneCodeSecret({ NODE_ENV: "development" });
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(readPhoneCodeSecret({ NODE_ENV: "development" })).toBe(a);
  });
});

describe("문자 대행사 설정 이름", () => {
  it("셋이 다 있어야 설정으로 본다", () => {
    expect(readSmsProviderConfig({ SMS_API_KEY: "k", SMS_API_SECRET: "s", SMS_SENDER_NUMBER: "02-1234-5678" })).toEqual({
      apiKey: "k",
      apiSecret: "s",
      senderNumber: "0212345678",
    });
    expect(readSmsProviderConfig({ SMS_API_KEY: "k", SMS_API_SECRET: "s" })).toBeNull();
    expect(readSmsProviderConfig({})).toBeNull();
  });
});
