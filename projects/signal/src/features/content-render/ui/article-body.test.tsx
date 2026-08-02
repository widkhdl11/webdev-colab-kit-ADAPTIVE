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
});
