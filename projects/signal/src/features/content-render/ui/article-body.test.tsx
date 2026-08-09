import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleBody } from "./article-body";

// content-safety.md 의 렌더 경로 불변식 검증 (INV-D3, 파서 방식 + 종단 D4/D5)
describe("ArticleBody (content-safety spec)", () => {
  // INV-D3 의 실질 강제는 게이트(NO_INNERHTML, gates/run-gates.mjs)가 소스 정규식으로 담당한다.
  // 이 테스트는 D3 를 '증명'하지 않는다(그건 게이트 몫) — 렌더 경로가 파서 기반(문자열 주입 아님)이라
  // sanitize 통과분이 실제 React 엘리먼트로 렌더됨을 보이고, script 부재를 종단 확인한다.
  it("INV-D3(게이트 강제): 렌더 경로는 파서 기반 — sanitize 통과분이 엘리먼트로 렌더된다", () => {
    const html = renderToStaticMarkup(<ArticleBody html={"<p>safe</p><script>alert(1)</script>"} />);
    expect(html).toContain("<p>safe</p>"); // 파서가 실제 <p> 엘리먼트로 렌더(문자열 주입 아님)
    expect(html).not.toMatch(/<script/i);   // 종단: script 는 실행 트리에 없다
  });

  it("INV-D4: 렌더된 링크에 rel=noopener noreferrer 가 있다", () => {
    const html = renderToStaticMarkup(<ArticleBody html={'<a href="https://ex.com">x</a>'} />);
    expect(html).toMatch(/rel="noopener noreferrer"/);
  });

  it("INV-D5: alt 없는 이미지는 빈 alt 로 렌더된다", () => {
    const html = renderToStaticMarkup(<ArticleBody html={'<img src="https://ex.com/a.png">'} />);
    expect(html).toMatch(/alt=""/);
  });

  // 이 변경의 효용은 전부 파서 건너편에 있다 — 화면에 나가는 건 sanitize 의 문자열이 아니라
  // html-react-parser 가 만든 엘리먼트다. 파서가 치수를 흘리면 sanitize 테스트는 전부 green 인데
  // 자리 예약은 안 된다. 표·pre 처럼 여기서 종단으로 확인한다.
  it("S10(종단): 치수가 파서를 지나 렌더까지 살아남는다", () => {
    const html = renderToStaticMarkup(
      <ArticleBody html={'<img src="https://ex.com/a.png" width="704" height="300">'} />,
    );
    expect(html).toMatch(/width="704"/);
    expect(html).toMatch(/height="300"/);
  });

  it("S11(종단): 거부된 치수는 렌더까지 오지 않는다", () => {
    const html = renderToStaticMarkup(
      <ArticleBody html={'<img src="https://ex.com/a.png" width="1" height="99999">'} />,
    );
    expect(html).toMatch(/<img/);
    expect(html).not.toMatch(/\bwidth\b/);
    expect(html).not.toMatch(/\bheight\b/);
  });

  // 아래 둘은 보안이 아니라 접근성이다(design-rules 2026-08-06 (2) "가로로 넘치는 것은
  // 키보드로도 닿아야 한다"). 원문에는 class 를 붙일 수 없어 껍데기를 여기서 끼우므로,
  // 그 배선이 실제로 붙는지는 여기서만 확인할 수 있다 — 더미 본문에는 표가 없어
  // 화면을 열어봐도 이 경로는 돌지 않는다.
  it("표는 가로 스크롤 껍데기로 감싸고 키보드로 닿게 한다", () => {
    const html = renderToStaticMarkup(
      <ArticleBody html={"<table><tbody><tr><td>a</td></tr></tbody></table>"} />,
    );
    expect(html).toMatch(/data-table-scroll/);
    expect(html).toMatch(/role="region"/);
    expect(html).toMatch(/tabindex="0"/);
    // 껍데기만 씌우고 표 내용을 잃어버리면 안 된다
    expect(html).toMatch(/<table>/);
    expect(html).toMatch(/<td>a<\/td>/);
  });

  it("코드 블록도 키보드로 닿는다 (가로 스크롤이 생기는 자리)", () => {
    const html = renderToStaticMarkup(
      <ArticleBody html={"<pre><code>const a = 1;</code></pre>"} />,
    );
    expect(html).toMatch(/<pre tabindex="0">/);
    expect(html).toMatch(/const a = 1;/);
  });
});
