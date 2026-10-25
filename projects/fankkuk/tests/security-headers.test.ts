import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

// 모든 주소에 붙는 보안 헤더(next.config.ts). 값이 빠지거나 바뀌면 여기서 빨간불이 난다.
async function siteHeaders(): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const all = rules.find((r) => r.source === "/(.*)");
  return Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
}

describe("보안 헤더", () => {
  it("다른 사이트로 가는 요청에는 출처만 보낸다(경로·링크 값은 넘기지 않음)", async () => {
    expect((await siteHeaders())["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("다른 사이트가 화면을 끼워 넣지 못한다", async () => {
    expect((await siteHeaders())["X-Frame-Options"]).toBe("DENY");
  });

  it("CSP 는 아직 기록만 하는 모드다(막는 모드로 바꿀 때 이 시험도 같이 바꾼다)", async () => {
    const h = await siteHeaders();
    expect(h["Content-Security-Policy-Report-Only"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toBeUndefined();
  });
});
