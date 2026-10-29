import { afterEach, describe, expect, it, vi } from "vitest";
import {
  choosePhoneVerifier,
  hashPhoneCode,
  FAKE_PHONE_CODE,
  makePhoneCode,
  PHONE_CODE_VARIABLE,
  readPhoneCodeSecret,
  solapiVerifier,
} from "./verifier";
import type { SolapiDelivery, SolapiPort } from "@/shared/api/solapi/solapi";
import { TEST_SITE_ORIGINS } from "@/shared/lib/env/test-site";

afterEach(() => vi.restoreAllMocks());

describe("INV-U9: 가짜 문자 창구는 운영에서 켜질 수 없다", () => {
  it("INV-U9 (S9): 운영 표시가 있으면 문자 창구가 없다 — 가짜로 넘어가지 않는다", () => {
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL_ENV: "production" }]) {
      expect(choosePhoneVerifier(env)).toBeNull();
    }
  });

  const FIVE = {
    SOLAPI_API_KEY: "k",
    SOLAPI_API_SECRET: "s",
    SMS_SENDER_NUMBER: "02-1234-5678",
    KAKAO_PF_ID: "pf",
    SOLAPI_PHONE_CODE_TEMPLATE_ID: "tpl",
  };

  it("INV-U9: 운영에서 솔라피 다섯 값이 다 있으면 진짜 창구다 — 고정 인증번호가 없다", () => {
    const v = choosePhoneVerifier({ NODE_ENV: "production", ...FIVE });
    expect(v?.kind).toBe("provider");
    expect(v?.fixedCode).toBeUndefined();
  });

  it("INV-U9 (S9, 실패경로): 운영에서 다섯 값 중 하나라도 없으면 창구가 없다 — 가짜도 나오지 않는다", () => {
    for (const missing of Object.keys(FIVE)) {
      const env: Record<string, string> = { NODE_ENV: "production", FK_FAKE_PHONE_VERIFIER: "1", ...FIVE };
      delete env[missing];
      expect(choosePhoneVerifier(env)).toBeNull();
      env[missing] = "  ";
      expect(choosePhoneVerifier(env)).toBeNull();
    }
  });

  it("INV-U9 (실패경로): 옛 이름(SMS_API_KEY·SMS_API_SECRET)으로는 창구가 생기지 않는다", () => {
    const { SOLAPI_API_KEY: _k, SOLAPI_API_SECRET: _s, ...rest } = FIVE;
    expect(choosePhoneVerifier({ NODE_ENV: "production", SMS_API_KEY: "k", SMS_API_SECRET: "s", ...rest })).toBeNull();
  });

  it("INV-U9: 로컬에서는 가짜 문자 창구가 나온다", () => {
    expect(choosePhoneVerifier({ NODE_ENV: "development" })?.kind).toBe("fake");
    expect(choosePhoneVerifier({ NODE_ENV: "test" })?.kind).toBe("fake");
  });

  it("INV-U15: 가짜 창구는 보내지 않고, 기록에는 번호 끝 4자리와 「보냄」만 — 본문·인증번호·전체 번호가 없다. 알림톡은 도착으로 답한다", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const fake = choosePhoneVerifier({ NODE_ENV: "development" })!;
    expect(await fake.sendKakaoCode("01055556666", "000000")).toBe(true);
    await fake.sendSms("01055556666", "[팬꾹] 인증번호 000000 (3분 안에 입력해 주세요)");
    expect(log).toHaveBeenCalledTimes(2);
    for (const call of log.mock.calls) {
      const line = String(call[0]);
      expect(line).toContain("6666");
      expect(line).toContain("보냄");
      expect(line).not.toContain("000000");
      expect(line).not.toContain("5555");
    }
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

describe("INV-U15: 솔라피 창구 — 알림톡 결과를 짧게 본다", () => {
  function port(statuses: SolapiDelivery[], opts: { sendThrows?: boolean } = {}) {
    const calls = { alimtalk: [] as Parameters<SolapiPort["sendAlimtalk"]>[0][], sms: [] as { to: string; text: string }[], lookups: 0 };
    const p: SolapiPort = {
      async sendAlimtalk(req) {
        calls.alimtalk.push(req);
        if (opts.sendThrows) throw new Error("down");
        return "M1";
      },
      async sendSms(req) {
        calls.sms.push(req);
        return "M2";
      },
      async deliveryOf() {
        calls.lookups += 1;
        return statuses.shift() ?? "pending";
      },
      async findAlimtalkByField() {
        return null;
      },
    };
    return { p, calls };
  }
  // 시계를 가짜로 — 기다림마다 그만큼 시간이 간다
  function clock() {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => void (t += ms) };
  }

  it("INV-U15 (S15c): 인증번호 템플릿에 #{인증번호} 변수로 보내고, 도착(4000)이 나오면 true", async () => {
    const { p, calls } = port(["pending", "delivered"]);
    const v = solapiVerifier(p, "TPL1", { timeoutMs: 8000, intervalMs: 1000, ...clock() });
    expect(await v.sendKakaoCode("01055556666", "123456")).toBe(true);
    expect(calls.alimtalk).toEqual([{ to: "01055556666", templateId: "TPL1", variables: { [PHONE_CODE_VARIABLE]: "123456" } }]);
    expect(PHONE_CODE_VARIABLE).toBe("#{인증번호}");
    expect(calls.lookups).toBe(2);
  });

  it("INV-U15 (S15c, 실패경로): 실패로 나오면 false", async () => {
    const { p } = port(["failed"]);
    expect(await solapiVerifier(p, "TPL1", { timeoutMs: 8000, intervalMs: 1000, ...clock() }).sendKakaoCode("01055556666", "123456")).toBe(false);
  });

  it("INV-U15 (실패경로): 8초 안에 도착이 확인되지 않으면 false — 더 기다리지 않는다", async () => {
    const { p, calls } = port([]);
    expect(await solapiVerifier(p, "TPL1", { timeoutMs: 8000, intervalMs: 1000, ...clock() }).sendKakaoCode("01055556666", "123456")).toBe(false);
    expect(calls.lookups).toBe(8);
  });

  it("INV-U15 (실패경로): 알림톡 접수가 실패하면 조회 없이 false", async () => {
    const { p, calls } = port(["delivered"], { sendThrows: true });
    expect(await solapiVerifier(p, "TPL1", { timeoutMs: 8000, intervalMs: 1000, ...clock() }).sendKakaoCode("01055556666", "123456")).toBe(false);
    expect(calls.lookups).toBe(0);
  });

  it("INV-U15: 문자는 받은 본문 그대로 한 통", async () => {
    const { p, calls } = port([]);
    await solapiVerifier(p, "TPL1").sendSms("01055556666", "[팬꾹] 인증번호 123456 (3분 안에 입력해 주세요)");
    expect(calls.sms).toEqual([{ to: "01055556666", text: "[팬꾹] 인증번호 123456 (3분 안에 입력해 주세요)" }]);
  });
});
