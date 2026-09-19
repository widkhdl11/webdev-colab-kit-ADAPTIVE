import { describe, it, expect } from "vitest";
import {
  BODY_URL_SCHEMES,
  SOURCE_URL_SCHEMES,
  safeSourceUrl,
} from "./url-safety";
import { sanitizeArticleHtml } from "./sanitize";

// content-safety.md INV-D6 — 렌더하는 모든 아웃바운드 URL 은 허용 스킴 목록을 통과해야 한다.
//
// D2 의 강제 위치는 sanitize 라 "본문 안의 URL" 만 덮는다. 출처 링크(sourceUrl)는 본문이 아니라
// 별도 필드라서 그 방벽 밖에 있었다 — 2026-08-06 review 에서 발견된 빈칸이 이것이다.
// (배선 자체, 즉 "상세 렌더에서 실제로 막히는가"는 widgets/article-view 의 테스트가 잡는다)
//
// 제어문자는 소스에 이스케이프로 적지 않고 상수로 조립한다 — 편집기·도구를 거치며
// 실제 문자로 뭉개진 적이 있어서다.
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);

describe("safeSourceUrl (INV-D6 — 출처 링크)", () => {
  it("INV-D6: http·https 출처 주소는 그대로 통과한다", () => {
    expect(safeSourceUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeSourceUrl("http://example.com/a")).toBe("http://example.com/a");
  });

  it("INV-D6(실패경로, S8): javascript: 출처 링크는 렌더 대상이 되지 못한다", () => {
    expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
  });

  it("INV-D6(실패경로, S9): 대소문자로 위장한 스킴을 거부한다", () => {
    expect(safeSourceUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeSourceUrl("JAVASCRIPT:alert(1)")).toBeNull();
  });

  it("INV-D6(실패경로, S9): 공백·제어문자로 위장한 스킴을 거부한다", () => {
    expect(safeSourceUrl(TAB + "javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl(LF + "javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl(" javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl("java" + TAB + "script:alert(1)")).toBeNull();
  });

  // ↑ 위 테스트만으로는 정리(cleanUrlInput)가 검증되지 않는다. 정리를 통째로 지워도
  //   "스킴을 못 찾음 → 거부"가 되어 그대로 통과하기 때문이다. 정리는 애초에 보안 장치가
  //   아니라 **멀쩡한 URL 을 잃지 않기 위한 것**이고, 그 성질은 아래 두 개가 잡는다.
  it("INV-D6: 앞뒤 공백·제어문자가 낀 정상 URL 을 잃지 않는다", () => {
    // 정리를 빼면 여기서 null 이 되어 출처 링크가 조용히 사라진다
    expect(safeSourceUrl(TAB + "https://example.com/a")).toBe(
      "https://example.com/a",
    );
    expect(safeSourceUrl("  https://example.com/a  ")).toBe(
      "https://example.com/a",
    );
    expect(safeSourceUrl("htt" + TAB + "ps://example.com/a")).toBe(
      "https://example.com/a",
    );
  });

  it("INV-D6: 돌려주는 값은 검사한 값과 같다 — 브라우저가 버릴 문자를 남기지 않는다", () => {
    // 검사한 문자열과 렌더할 문자열이 다르면 검사가 의미를 잃는다.
    expect(safeSourceUrl(" https://example.com/a" + LF)).toBe(
      "https://example.com/a",
    );
  });

  it("INV-D6(실패경로, S9): 허용 스킴으로 '시작만' 하는 다른 스킴을 거부한다", () => {
    // 접두 비교(startsWith)로 구현하면 아래가 전부 통과해버린다.
    // RFC 3986 상 유효한 별개 스킴이라 브라우저는 다르게 해석한다.
    expect(safeSourceUrl("https-evil:alert(1)")).toBeNull();
    expect(safeSourceUrl("httpx://evil.example.com")).toBeNull();
    expect(safeSourceUrl("http-x:payload")).toBeNull();
  });

  it("INV-D6(실패경로): 그 밖의 실행 가능·로컬 스킴을 거부한다", () => {
    expect(safeSourceUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeSourceUrl("file:///etc/passwd")).toBeNull();
    expect(safeSourceUrl("blob:https://example.com/uuid")).toBeNull();
  });

  it("INV-D6(실패경로, S9): data: 스킴을 거부한다", () => {
    expect(safeSourceUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("INV-D6(실패경로): 프로토콜 상대 주소(//호스트)를 거부한다", () => {
    // 스킴이 안 적혔을 뿐 실제로는 외부로 나간다. 허용 목록 방식이므로 '스킴 없음'은 거부다.
    expect(safeSourceUrl("//evil.example.com/a")).toBeNull();
  });

  it("INV-D6(실패경로): mailto: 는 본문에서는 허용이지만 출처 링크로는 거부한다", () => {
    // 출처는 '원문이 있는 웹 주소'다. 메일 주소를 받을 이유가 없고,
    // 목록을 넓게 잡아두면 나중에 왜 넓은지 아무도 모른다.
    expect(safeSourceUrl("mailto:hi@example.com")).toBeNull();
    expect(BODY_URL_SCHEMES).toContain("mailto");
    expect(SOURCE_URL_SCHEMES).not.toContain("mailto");
  });

  it("INV-D6(실패경로): 스킴이 없는 값·빈 값을 거부한다", () => {
    expect(safeSourceUrl("example.com/a")).toBeNull();
    expect(safeSourceUrl("/articles/1")).toBeNull();
    expect(safeSourceUrl("")).toBeNull();
    expect(safeSourceUrl("   ")).toBeNull();
  });

  it("INV-D6(실패경로): 문자열이 아닌 값이 와도 던지지 않고 거부한다", () => {
    // 타입은 string 이지만 신뢰 경계 밖이다 — 조회가 붙으면 null·누락이 올 수 있고,
    // 던지면 링크 하나가 아니라 상세 페이지 전체가 500 이 된다.
    expect(safeSourceUrl(null as unknown as string)).toBeNull();
    expect(safeSourceUrl(undefined as unknown as string)).toBeNull();
    expect(safeSourceUrl(123 as unknown as string)).toBeNull();
  });
});

describe("스킴 목록의 정본 (INV-D6 — 한 곳에서만 정한다)", () => {
  it("INV-D6: 허용 목록이 비어 있지 않다", () => {
    // 아래 루프가 vacuous 하게 통과하는 것을 막는다. BODY_URL_SCHEMES 가 [] 가 되면
    // 본문의 모든 링크·이미지가 사라지는데, 루프만으로는 그 파국이 '통과'로 보인다.
    expect(BODY_URL_SCHEMES.length).toBeGreaterThan(0);
    expect(SOURCE_URL_SCHEMES.length).toBeGreaterThan(0);
  });

  it("INV-D6: 정상 https 링크·이미지는 본문에서 살아남는다", () => {
    // 루프와 무관하게 항상 실행되는 단언. 화이트리스트가 과하게 좁아지는 회귀를 잡는다.
    expect(sanitizeArticleHtml('<a href="https://ex.com/a">x</a>')).toContain(
      'href="https://ex.com/a"',
    );
    expect(sanitizeArticleHtml('<img src="https://ex.com/a.png">')).toContain(
      'src="https://ex.com/a.png"',
    );
  });

  it("INV-D6: sanitize 의 본문 링크 허용 스킴이 BODY_URL_SCHEMES 와 같은 정본을 쓴다", () => {
    for (const scheme of BODY_URL_SCHEMES) {
      const href =
        scheme === "mailto"
          ? "mailto:hi@example.com"
          : `${scheme}://example.com/a`;
      expect(sanitizeArticleHtml(`<a href="${href}">x</a>`)).toContain(href);
    }
  });

  it("INV-D6(실패경로): 정본에 없는 스킴은 본문에서도 제거된다", () => {
    const allowed: readonly string[] = BODY_URL_SCHEMES;
    const notAllowed = ["ftp", "vbscript", "file"].filter(
      (s) => !allowed.includes(s),
    );
    expect(notAllowed.length).toBeGreaterThan(0);
    for (const scheme of notAllowed) {
      const out = sanitizeArticleHtml(
        `<a href="${scheme}://example.com/a">x</a>`,
      );
      expect(out).not.toMatch(new RegExp(`${scheme}:`, "i"));
    }
  });

  it("INV-D6(실패경로): 본문 링크의 javascript: 는 계속 제거된다(D2 회귀)", () => {
    const out = sanitizeArticleHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });
});
