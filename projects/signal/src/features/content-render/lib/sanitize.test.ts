import { describe, it, expect } from "vitest";
import { sanitizeArticleHtml } from "./sanitize";

// content-safety.md 의 sanitize 관련 불변식 검증 (INV-D1·D2·D4·D5, 순수 문자열)
describe("sanitizeArticleHtml (content-safety spec)", () => {
  it("INV-D1: <script> 를 제거해 저장 HTML 이 실행될 수 없다", () => {
    const out = sanitizeArticleHtml("<p>hi</p><script>alert(1)</script>");
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("hi");
  });

  it("INV-D2(실패경로): on* 이벤트 핸들러 속성을 제거한다", () => {
    const out = sanitizeArticleHtml('<img src="https://ex.com/a.png" onerror="alert(1)">');
    expect(out).not.toMatch(/onerror/i);
  });

  it("INV-D2(실패경로): href 의 javascript: 스킴을 제거한다", () => {
    const out = sanitizeArticleHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("INV-D2: 화이트리스트 서식 태그는 유지한다", () => {
    const out = sanitizeArticleHtml("<h2>t</h2><p>a</p><ul><li>x</li></ul><pre><code>y</code></pre>");
    expect(out).toMatch(/<h2>/);
    expect(out).toMatch(/<li>/);
    expect(out).toMatch(/<code>/);
  });

  it("INV-D2(실패경로): 화이트리스트 밖 태그(style)는 제거한다", () => {
    const out = sanitizeArticleHtml("<style>*{color:red}</style><p>ok</p>");
    expect(out).not.toMatch(/<style/i);
    expect(out).toContain("ok");
  });

  it("INV-D4: 링크는 target=_blank 와 rel=noopener noreferrer 를 갖는다", () => {
    const out = sanitizeArticleHtml('<a href="https://ex.com/article">읽기</a>');
    expect(out).toMatch(/target="_blank"/);
    expect(out).toMatch(/rel="noopener noreferrer"/);
  });

  it("INV-D5: alt 없는 이미지는 빈 alt(장식)로 채운다", () => {
    const out = sanitizeArticleHtml('<img src="https://ex.com/a.png">');
    expect(out).toMatch(/alt=""/);
  });
});

// 보안 회귀 방지 (리뷰 지적): sanitize 는 stored XSS 를 막는 유일한 방벽이라,
// 설정 한 줄만 바꿔도(화이트리스트에 iframe·data:·style 추가 등) 조용히 XSS 가 되살아난다.
// 아래는 "이런 벡터는 반드시 막혀야 한다"를 못박아 회귀를 잡는다. 모두 현재 구현에서 통과(green).
describe("sanitizeArticleHtml 보안 회귀 (content-safety spec)", () => {
  it("INV-D2(우회): data: URI href 는 제거된다", () => {
    const out = sanitizeArticleHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(out).not.toMatch(/href=/i);
    expect(out).not.toMatch(/data:/i);
    expect(out).not.toMatch(/<script/i);
  });

  it("INV-D2(우회): data: URI 이미지 src 는 제거된다", () => {
    const out = sanitizeArticleHtml('<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">');
    expect(out).not.toMatch(/data:/i);
    expect(out).not.toMatch(/src=/i);
  });

  it("INV-D2(우회): 프로토콜 상대 URL(//host) href 는 제거된다", () => {
    const out = sanitizeArticleHtml('<a href="//evil.com/x">x</a>');
    expect(out).not.toMatch(/href=/i);
    expect(out).not.toMatch(/evil\.com/i);
  });

  it("INV-D2(우회): 대문자/혼합 스킴(JAVASCRIPT:)도 제거된다", () => {
    const out = sanitizeArticleHtml('<a href="JaVaScRiPt:alert(1)">x</a>');
    expect(out).not.toMatch(/href=/i);
    expect(out).not.toMatch(/script:/i);
  });

  it("INV-D2(우회): 공백/제어문자 삽입 스킴(jav\\tascript:)도 무력화된다", () => {
    const out = sanitizeArticleHtml('<a href="jav\tascript:alert(1)">x</a>');
    expect(out).not.toMatch(/href=/i);
  });

  it("INV-D2(우회): iframe·form·object 태그는 제거된다", () => {
    const out = sanitizeArticleHtml('<iframe src="https://evil.com"></iframe><form action="/x"></form><object data="x"></object>');
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/<form/i);
    expect(out).not.toMatch(/<object/i);
  });

  it("INV-D1(우회): svg 안의 script 도 제거된다", () => {
    const out = sanitizeArticleHtml("<svg><script>alert(1)</script></svg>");
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<svg/i);
  });

  it("INV-D2(우회): style 속성(CSS 벡터 포함)은 제거된다", () => {
    const out = sanitizeArticleHtml('<p style="background:url(javascript:alert(1))">x</p>');
    expect(out).not.toMatch(/style=/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain("x");
  });

  it("INV-D2(우회): on* 이벤트 핸들러는 태그·핸들러 무관하게 제거된다", () => {
    const out = sanitizeArticleHtml('<a href="https://ex.com" onmouseover="x()">y</a><p onclick="z()">w</p>');
    expect(out).not.toMatch(/onmouseover/i);
    expect(out).not.toMatch(/onclick/i);
  });

  it("빈 문자열은 빈 문자열로 반환된다(엣지)", () => {
    expect(sanitizeArticleHtml("")).toBe("");
  });

  it("허용 태그의 깊은 중첩은 구조가 보존된다(엣지)", () => {
    const out = sanitizeArticleHtml("<blockquote><ul><li><strong>a</strong></li></ul></blockquote>");
    expect(out).toMatch(/<blockquote>/);
    expect(out).toMatch(/<li>/);
    expect(out).toMatch(/<strong>a<\/strong>/);
  });
});
