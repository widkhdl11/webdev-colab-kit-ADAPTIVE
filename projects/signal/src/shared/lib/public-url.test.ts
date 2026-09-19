import { describe, expect, it } from "vitest";
import { isPublicHttpUrl, normalizePublicHttpUrl } from "./public-url";

/**
 * INV-IA5 의 판정부. 「막는가」와 「멀쩡한 것을 통과시키는가」를 같이 본다 —
 * 전부 막는 구현은 앞쪽만 보면 통과하고, 그러면 수집이 통째로 죽는다.
 */
describe("isPublicHttpUrl", () => {
  it("INV-IA5 (S10): 공개 인터넷의 http·https 주소는 통과한다", () => {
    for (const url of [
      "https://openai.com/index/post",
      "http://example.com/a?b=c",
      "https://blog.example.co.kr:8443/x",
      "https://203.0.113.10/feed", // 문서용 공인 대역 — 막는 목록에 없다
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(true);
    }
  });

  it("INV-IA5 (S11, 실패경로): 루프백은 어떤 표기로 와도 막는다", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://127.1.2.3/",
      "http://localhost/",
      "http://LOCALHOST:8080/",
      "http://app.localhost/",
      "http://2130706433/", // 십진 한 덩어리
      "http://0x7f.1/", // 16진 섞기
      "http://017700000001/", // 8진
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/", // IPv4 를 품은 IPv6
      "http://[::ffff:0:127.0.0.1]/", // IPv4 를 옮겨 적은 표기
      "http://[64:ff9b::127.0.0.1]/", // NAT64 의 약속된 접두
      "http://localhost./", // 뒤에 점 — DNS 는 완전한 이름으로 읽어 그대로 푼다
      "http://localhost.:3000/",
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
  });

  it("INV-IA5 (S12, 실패경로): 사설·링크로컬·메타데이터 주소를 막는다", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/", // 클라우드 자격 증명이 나오는 자리
      "http://10.0.0.5/",
      "http://172.16.0.1/",
      "http://172.31.255.254/",
      "http://192.168.0.1/",
      "http://100.64.0.1/",
      "http://0.0.0.0/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://db.internal/",
      "http://printer.local/",
      "http://db.internal./", // 뒤에 점을 붙여 이름 대조를 지나가려는 것
      "http://printer.local../",
      "http://[::ffff:a9fe:a9fe]/", // 메타데이터 주소를 IPv6 으로 적은 것
      "http://[2002:a9fe:a9fe::]/", // 6to4 — 접두 다음 두 덩어리가 IPv4 다
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
  });

  it("INV-IA5 (S13, 실패경로): 172.16/12 의 경계 바로 밖은 막지 않는다 — 대역을 넓게 잡지 않았다", () => {
    expect(isPublicHttpUrl("http://172.15.0.1/")).toBe(true);
    expect(isPublicHttpUrl("http://172.32.0.1/")).toBe(true);
  });

  it("INV-IA5 (S20, 실패경로): 점이 없는 이름은 막는다 — 사내망에서 내부 호스트로 풀린다", () => {
    for (const url of ["http://intranet/", "http://metadata/", "http://gitlab:8080/"]) {
      expect(isPublicHttpUrl(url), url).toBe(false);
    }
    expect(isPublicHttpUrl("http://news.example.com/")).toBe(true); // 점이 있으면 그대로 통과
  });

  it("INV-IA5 (S21, 실패경로): 자격 증명이 든 주소는 막는다 — 요청 쪽이 어차피 거부한다", () => {
    expect(isPublicHttpUrl("http://user:pw@example.com/")).toBe(false);
    expect(isPublicHttpUrl("http://expected.com@127.0.0.1/")).toBe(false);
  });

  it("INV-IA5: 통과하면 정규화된 주소를 돌려준다 — 검사한 것과 보내는 것이 같아야 한다", () => {
    expect(normalizePublicHttpUrl("  https://Example.COM/a?b=1  ")).toBe("https://example.com/a?b=1");
    expect(normalizePublicHttpUrl("http://127.0.0.1/")).toBe(null);
  });

  it("INV-IA5 (S14, 실패경로): http·https 가 아닌 것은 전부 막는다", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com/x",
      "gopher://example.com/x",
      "data:text/html,<b>x</b>",
      "javascript:alert(1)",
      "java\tscript:alert(1)", // 브라우저가 버리는 문자를 우리도 버린 뒤 판정한다
      "//example.com/x", // 스킴을 못 찾음 — 허용 목록에서는 거부다
      "example.com/x",
      "",
    ]) {
      expect(isPublicHttpUrl(url), JSON.stringify(url)).toBe(false);
    }
  });
});
