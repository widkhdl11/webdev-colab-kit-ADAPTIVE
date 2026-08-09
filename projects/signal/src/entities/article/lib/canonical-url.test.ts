import { describe, expect, it } from "vitest";
import { canonicalizeUrl, TRACKING_PARAMS } from "./canonical-url";

/**
 * INV-C2 (ingestion-ranking): canonical_url 은 정규화를 거친 값이다.
 * 이 값이 항목의 유일성 판정 기준이므로(INV-C1), 여기서 갈리면 같은 기사가 두 건이 된다.
 */
describe("canonicalizeUrl — INV-C2 원문 URL 정규화", () => {
  it("INV-C2: 스킴과 호스트를 소문자로 만든다", () => {
    expect(canonicalizeUrl("HTTPS://EX.com/a")).toBe("https://ex.com/a");
  });

  it("INV-C2: fragment(#) 를 버린다", () => {
    expect(canonicalizeUrl("https://ex.com/a#top")).toBe("https://ex.com/a");
  });

  it("INV-C2: 트레일링 슬래시를 정리한다 (루트는 남긴다)", () => {
    expect(canonicalizeUrl("https://ex.com/a/")).toBe("https://ex.com/a");
    expect(canonicalizeUrl("https://ex.com/a///")).toBe("https://ex.com/a");
    // 루트까지 지우면 "https://ex.com" 이 돼 URL 로서 형태가 달라진다.
    expect(canonicalizeUrl("https://ex.com/")).toBe("https://ex.com/");
  });

  it("INV-C2: 추적 파라미터를 지우고 나머지 쿼리는 남긴다", () => {
    expect(canonicalizeUrl("https://ex.com/a?utm_source=rss&id=7")).toBe(
      "https://ex.com/a?id=7",
    );
  });

  it("INV-C2: 추적 파라미터만 있으면 물음표까지 지운다", () => {
    expect(canonicalizeUrl("https://ex.com/a?utm_source=rss&utm_medium=x")).toBe(
      "https://ex.com/a",
    );
  });

  it("INV-C2: 목록에 적힌 추적 파라미터를 하나도 빠짐없이 지운다", () => {
    // 목록을 줄이면 이 테스트가 깨진다 — 목록 자체가 검증 대상이다.
    for (const param of TRACKING_PARAMS) {
      expect(canonicalizeUrl(`https://ex.com/a?${param}=v`)).toBe(
        "https://ex.com/a",
      );
    }
    // utm_ 은 접두사 규칙이라 목록에 없는 이름도 지워져야 한다.
    expect(canonicalizeUrl("https://ex.com/a?utm_madeup=v")).toBe(
      "https://ex.com/a",
    );
  });

  it("INV-C2 (S2): 추적 파라미터·fragment·대문자·트레일링 슬래시가 한 URL 로 수렴한다", () => {
    const a = canonicalizeUrl("https://ex.com/a?utm_source=rss#top");
    const b = canonicalizeUrl("HTTPS://EX.com/a/");
    expect(a).toBe("https://ex.com/a");
    expect(b).toBe("https://ex.com/a");
    expect(a).toBe(b);
  });

  it("INV-C2: 기본 포트는 표기에서 빠지고, 기본이 아닌 포트는 남는다", () => {
    expect(canonicalizeUrl("https://ex.com:443/a")).toBe("https://ex.com/a");
    expect(canonicalizeUrl("https://ex.com:8443/a")).toBe("https://ex.com:8443/a");
  });

  it("INV-C2: 같은 입력이면 항상 같은 출력이고, 두 번 걸어도 값이 안 바뀐다", () => {
    const once = canonicalizeUrl("HTTPS://EX.com/a/?utm_source=rss#top");
    expect(once).not.toBeNull();
    expect(canonicalizeUrl(once as string)).toBe(once);
  });

  describe("실패 경로 — 유일성 기준이 될 수 없는 값은 null", () => {
    it("INV-C2 실패경로: 파싱 불가능한 문자열은 null", () => {
      expect(canonicalizeUrl("이건 URL 이 아니다")).toBeNull();
      expect(canonicalizeUrl("")).toBeNull();
      expect(canonicalizeUrl("   ")).toBeNull();
    });

    it("INV-C2 실패경로: http·https 가 아닌 스킴은 null", () => {
      // 원문 링크는 결국 화면에서 밖으로 나가는 주소다 (content-safety INV-D6).
      // 여기서 통과시키면 sanitize 가 막는 값이 DB 의 유일성 키로 남는다.
      expect(canonicalizeUrl("javascript:alert(1)")).toBeNull();
      expect(canonicalizeUrl("data:text/html,x")).toBeNull();
      expect(canonicalizeUrl("mailto:a@b.com")).toBeNull();
      expect(canonicalizeUrl("ftp://ex.com/a")).toBeNull();
    });

    it("INV-C2 실패경로: 스킴을 숨긴 변형도 통과하지 못한다", () => {
      expect(canonicalizeUrl("  javascript:alert(1)")).toBeNull();
      expect(canonicalizeUrl("JAVASCRIPT:alert(1)")).toBeNull();
      expect(canonicalizeUrl("java\tscript:alert(1)")).toBeNull();
    });

    it("INV-C2 실패경로: 호스트가 없으면 null", () => {
      expect(canonicalizeUrl("https://")).toBeNull();
      expect(canonicalizeUrl("https://?x=1")).toBeNull();
    });

    it("슬래시가 셋이어도 호스트가 없는 건 아니다 — 브라우저와 같게 읽는다", () => {
      // 처음엔 `https:///a` 를 "호스트 없음"으로 예상했는데 틀렸다. WHATWG URL 은
      // 슬래시를 더 받아 넘기고 `a` 를 호스트로 읽는다(브라우저도 그렇게 연다).
      // 우리가 브라우저와 다르게 읽으면 "검사한 주소"와 "열리는 주소"가 갈린다.
      expect(canonicalizeUrl("https:///a")).toBe("https://a/");
    });
  });
});
