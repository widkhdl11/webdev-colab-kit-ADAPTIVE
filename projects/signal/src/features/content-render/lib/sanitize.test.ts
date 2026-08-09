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

// ── 이미지 치수 (INV-D2, 2026-08-08 추가 · S10/S11) ─────────────────────────
// 이 스펙에서 화이트리스트가 "속성 이름만 본다"에서 "값도 본다"로 넘어온 첫 자리다.
// 통과 조건은 둘 다 있고 둘 다 양의 정수 — 하나라도 어긋나면 둘 다 뺀다.
//
// ⚠ 아래 실패경로들은 그냥 두면 알리바이가 된다: width/height 를 애초에 허용하지 않아도
//    전부 통과한다(없는 속성은 "제거된 것"과 구별되지 않는다). 그래서 S10(보존)이
//    이 묶음의 진짜 앵커다 — 숫자 검증을 지우면 S11 이, 허용을 지우면 S10 이 빨개진다.
//    (구현 후 두 변이를 실제로 돌려 확인했다)
describe("sanitizeArticleHtml 이미지 치수 (content-safety S10/S11/S12)", () => {
  const src = 'src="https://ex.com/a.png"';

  // 단언에 `/width=/` 대신 `/\bwidth\b/` 를 쓰는 이유: width·height 는 sanitize-html 의
  // nonBooleanAttributes 라, 값이 undefined 로 새면 `=` 없이 ` width` 로만 출력된다.
  // `=` 를 요구하면 그 구현을 못 잡는다. src·alt 값에 이 단어가 없어 오탐 위험도 없다.
  function hasNoDimensions(out: string) {
    expect(out).not.toMatch(/\bwidth\b/);
    expect(out).not.toMatch(/\bheight\b/);
  }

  it("S10: width·height 가 둘 다 양의 정수면 보존한다 (자리 예약이 가능해진다)", () => {
    const out = sanitizeArticleHtml(`<img ${src} width="704" height="300">`);
    expect(out).toMatch(/width="704"/);
    expect(out).toMatch(/height="300"/);
  });

  // 아래는 전부 "둘 다 제거". 이미지 자체는 남는다 — 치수가 틀렸다고 그림을 버리지 않는다.
  const bad: ReadonlyArray<readonly [string, string]> = [
    ["숫자가 아님", 'width="abc" height="300"'],
    ["음수", 'width="-1" height="300"'],
    ["정수가 아님", 'width="704.5" height="300"'],
    ["height 쪽이 깨짐", 'width="704" height="abc"'],
    ["width 만 있음 — 하나로는 비율을 못 구한다", 'width="704"'],
    ["height 만 있음", 'height="300"'],
    ["빈 값 (앵커는 height 쪽 — width 는 라이브러리가 알아서 지운다)", 'width="" height="300"'],
    ["단위가 붙음 (px 는 HTML 속성 문법이 아니다)", 'width="704px" height="300px"'],
    ["공백으로 위장", 'width=" 704 " height="300"'],

    // ── 아래는 전부 양의 정수다. 정수 검사만으로는 못 잡는 자리. ──
    ["비율이 세로로 극단 (로드 전 거대한 빈 공간이 생긴다)", 'width="1" height="99999"'],
    ["비율이 가로로 극단", 'width="99999" height="1"'],
    // 비율 상한을 [10, ∞) 어디에나 둬도 통과하던 구멍을 막는다. 상한 바로 바깥값이라
    // MAX_RATIO 를 11 로만 올려도 이 줄이 빨개진다.
    ["비율이 상한 바로 밖 (10.0025:1)", 'width="400" height="4001"'],
    // 절대 상한 (조건 4). 비율은 1:1 이라 비율 가드가 침묵하는 자리다.
    ["절대 상한 바로 밖", 'width="20001" height="20001"'],
    ["실측값일 수 없는 자릿수", 'width="99999999999999999999" height="99999999999999999999"'],

    // ⚠ 이 줄이 있어야 "0 거부"가 처음으로 실제 검증된다.
    //    `width="0" height="300"` 으로는 안 된다 — 300/0 = Infinity > 10 이라 **비율 가드가
    //    대신 잡아서**, 정수 검사를 /^[0-9]+$/ 로 풀어도 green 으로 살아남는다(알리바이).
    //    0 쌍은 0/0 = NaN 이고 NaN > 10 은 false 라 비율 가드가 침묵한다 → 정수 검사가 유일한 방벽.
    ["0 쌍 — 비율 가드가 침묵하는 자리", 'width="0" height="0"'],
    ["0 (비율 가드가 대신 잡는 자리)", 'width="0" height="300"'],
  ];

  it.each(bad)("S11(실패경로): %s → width·height 를 둘 다 제거한다", (_label, attrs) => {
    const out = sanitizeArticleHtml(`<img ${src} ${attrs} alt="설명">`);
    hasNoDimensions(out);
    // 그림과 나머지 속성은 살아 있어야 한다 — 치수가 틀렸다고 그림을 버리지 않는다
    expect(out).toMatch(/<img/);
    expect(out).toMatch(/src="https:\/\/ex\.com\/a\.png"/);
    expect(out).toMatch(/alt="설명"/);
  });

  it("S12: 절대 상한 경계값(20000)은 보존한다", () => {
    const out = sanitizeArticleHtml(`<img ${src} width="20000" height="20000">`);
    expect(out).toMatch(/width="20000"/);
    expect(out).toMatch(/height="20000"/);
  });

  it("S12: 비율 상한 경계값(정확히 10:1)은 보존한다 — 긴 스크린샷을 통째로 버리지 않는다", () => {
    // 경계 '안쪽'이 아니라 경계 그 자리다(구현이 `>` 비교라 포함).
    // 그래서 `>` 를 `>=` 로 바꾸는 변이를 이 줄이 잡는다.
    const out = sanitizeArticleHtml(`<img ${src} width="400" height="4000">`);
    expect(out).toMatch(/width="400"/);
    expect(out).toMatch(/height="4000"/);
  });

  it("치수를 안 들고 온 이미지는 손대지 않는다 (없는 것은 위반이 아니다)", () => {
    // 출력 전체를 고정한다 — 속성을 날조하거나 잃는 구현을 전부 잡는다.
    // (이 한 개만 정확 비교로 둔다. 전부 이렇게 가면 속성 순서에 묶여 부서진다)
    expect(sanitizeArticleHtml(`<img ${src} alt="설명">`)).toBe(
      '<img src="https://ex.com/a.png" alt="설명" />',
    );
  });

  it("값 검사는 img 의 치수에만 건다 — 다른 태그의 width 는 이름 단계에서 걸린다", () => {
    // "값까지 보는 속성은 이 둘뿐"이라는 이 확장의 경계 자체를 못 박는다.
    const td = sanitizeArticleHtml('<table><tbody><tr><td width="500">x</td></tr></tbody></table>');
    expect(td).not.toMatch(/\bwidth\b/);
    expect(td).toMatch(/<td>x<\/td>/);
    const p = sanitizeArticleHtml('<p width="1">x</p>');
    expect(p).toBe("<p>x</p>");
  });

  it("INV-D2 는 그대로다: 치수가 멀쩡해도 on* 과 style 은 여전히 제거된다", () => {
    const out = sanitizeArticleHtml(
      `<img ${src} width="704" height="300" onerror="alert(1)" style="position:fixed">`,
    );
    expect(out).toMatch(/width="704"/);
    expect(out).toMatch(/height="300"/); // 쌍이 온전히 살아남는 것까지 본다
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/style=/i);
  });

  // 자리 예약(aspect-ratio)이 붙으면서 생긴 자리다: 스킴이 거부돼 src 를 잃은 이미지가
  // 껍데기로 남으면 **영원히 안 채워지는 회색 상자**가 화면에 보인다.
  // 치수 없는 이미지의 예약은 언젠가 그림으로 채워지지만 이 자리는 그렇지 않다.
  it("src 를 잃은 이미지는 태그째 사라진다 (빈 상자를 남기지 않는다)", () => {
    expect(sanitizeArticleHtml('<img src="data:image/png;base64,AAAA" alt="x">')).toBe("");
    expect(sanitizeArticleHtml('<img alt="x">')).toBe("");
    // 주변 내용은 잃지 않는다
    expect(sanitizeArticleHtml('<p>앞</p><img src="javascript:alert(1)"><p>뒤</p>')).toBe(
      "<p>앞</p><p>뒤</p>",
    );
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
