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

describe("address-protection INV-P20 ①: 우편번호 서비스", () => {
  const directive = (csp: string, name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";

  it("INV-P20: 스크립트 허용 목록에 우편번호 서비스 스크립트 주소, 프레임 허용 목록에 검색 화면 주소가 있다", async () => {
    const csp = (await siteHeaders())["Content-Security-Policy-Report-Only"] ?? "";
    expect(directive(csp, "script-src").split(" ")).toContain("https://t1.kakaocdn.net");
    expect(directive(csp, "frame-src").split(" ")).toContain("https://postcode.map.kakao.com");
  });

  it("INV-P20 (실패경로): 그 서비스 주소만 더한다 — 다음·카카오의 다른 주소나 넓은 와일드카드는 없다", async () => {
    const csp = (await siteHeaders())["Content-Security-Policy-Report-Only"] ?? "";
    const kakaoish = csp.split(/[\s;]+/).filter((t) => /daum|kakao/.test(t));
    expect(kakaoish.sort()).toEqual(["https://postcode.map.kakao.com", "https://t1.kakaocdn.net"]);
  });

  // 2026-11-14: 카카오가 t1.daumcdn.net 을 11-30 에 닫는다고 알려 t1.kakaocdn.net 으로 옮겼다 — 불러오는 주소와 허용 목록이 갈라지면 운영에서 검색이 막힌다
  it("INV-P20: 화면이 불러오는 스크립트 주소가 스크립트 허용 목록 안에 있다(옛 t1.daumcdn.net 은 쓰지 않는다)", async () => {
    const { POSTCODE_SCRIPT_SRC } = await import("../src/shared/lib/postcode/load-postcode");
    const csp = (await siteHeaders())["Content-Security-Policy-Report-Only"] ?? "";
    expect(directive(csp, "script-src").split(" ")).toContain(new URL(POSTCODE_SCRIPT_SRC).origin);
    expect(POSTCODE_SCRIPT_SRC).not.toContain("daumcdn");
  });
});
