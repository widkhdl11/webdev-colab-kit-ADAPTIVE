import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_SITE_ORIGINS } from "@/shared/lib/env/test-site";
import { TestSiteBand } from "./test-site-band";

afterEach(() => vi.unstubAllEnvs());

describe("INV-TS3: 시험 사이트 띠", () => {
  it("INV-TS3 (S3): 시험 사이트면 「시험 사이트」 띠와 가짜 확인이라는 안내가 보인다", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FANKKUK_TEST_SITE", "1");
    vi.stubEnv("APP_ORIGIN", TEST_SITE_ORIGINS[0]!);
    const html = renderToStaticMarkup(<TestSiteBand />);
    expect(html).toContain("시험 사이트");
    expect(html).toContain("실제 선물");
    expect(html).toContain('role="note"');
  });

  it("INV-TS3 (S3b, 실패경로): 시험 사이트가 아니면 띠가 없다", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FANKKUK_TEST_SITE", "1");
    vi.stubEnv("APP_ORIGIN", "https://fankkuk.com");
    expect(renderToStaticMarkup(<TestSiteBand />)).toBe("");
    vi.stubEnv("APP_ORIGIN", TEST_SITE_ORIGINS[0]!);
    vi.stubEnv("FANKKUK_TEST_SITE", "");
    expect(renderToStaticMarkup(<TestSiteBand />)).toBe("");
  });
});
