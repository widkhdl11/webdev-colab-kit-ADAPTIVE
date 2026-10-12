import { describe, expect, it } from "vitest";
import { allowsFakeChannels, isTestSite, TEST_SITE_ORIGINS } from "./test-site";

const ORIGIN = TEST_SITE_ORIGINS[0]!;

describe("INV-TS1: 시험 사이트 판정 — 설정값과 시험 주소 둘 다 맞아야 한다", () => {
  it("INV-TS1 (S1): 운영 빌드라도 FANKKUK_TEST_SITE=1 이고 사이트 주소가 시험 주소면 시험 사이트다", () => {
    expect(isTestSite({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: ORIGIN })).toBe(true);
    expect(isTestSite({ NODE_ENV: "production", VERCEL_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: `${ORIGIN}/` })).toBe(true);
  });

  it("INV-TS1 (S1b, 실패경로): 사이트 주소가 시험 주소가 아니면 시험 사이트가 아니다", () => {
    for (const APP_ORIGIN of [undefined, "", "https://fankkuk.com", `${ORIGIN}.evil.com`, "not a url", ORIGIN.replace("https:", "http:")]) {
      expect(isTestSite({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN })).toBe(false);
    }
  });

  it("INV-TS1 (S1c, 실패경로): FANKKUK_TEST_SITE 가 정확히 1 이 아니면 시험 사이트가 아니다", () => {
    for (const FANKKUK_TEST_SITE of [undefined, "", "true", "0", "yes", " 1"]) {
      expect(isTestSite({ NODE_ENV: "production", FANKKUK_TEST_SITE, APP_ORIGIN: ORIGIN })).toBe(false);
    }
  });

  it("INV-TS1: 시험 주소 목록은 https 사이트 주소만 담는다", () => {
    expect(TEST_SITE_ORIGINS.length).toBeGreaterThan(0);
    for (const o of TEST_SITE_ORIGINS) expect(new URL(o).origin).toBe(o);
    for (const o of TEST_SITE_ORIGINS) expect(o.startsWith("https://")).toBe(true);
  });
});

describe("INV-TS2: 가짜 창구를 열어도 되는가", () => {
  it("INV-TS2: 로컬은 열고, 운영은 시험 사이트일 때만 연다", () => {
    expect(allowsFakeChannels({ NODE_ENV: "development" })).toBe(true);
    expect(allowsFakeChannels({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: ORIGIN })).toBe(true);
  });

  it("INV-TS2 (S2b, 실패경로): 운영 빌드에서 시험 사이트가 아니면 열지 않는다", () => {
    expect(allowsFakeChannels({ NODE_ENV: "production" })).toBe(false);
    expect(allowsFakeChannels({ NODE_ENV: "development", VERCEL_ENV: "production" })).toBe(false);
    expect(allowsFakeChannels({ NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: "https://fankkuk.com" })).toBe(false);
  });
});
