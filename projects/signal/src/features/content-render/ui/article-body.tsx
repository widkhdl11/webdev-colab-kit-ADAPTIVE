import parse from "html-react-parser";
import { sanitizeArticleHtml } from "../lib/sanitize";

// content-safety.md INV-D3: 원문 HTML 을 raw-HTML 주입 API 없이 렌더한다(스펙 참조).
// sanitize(화이트리스트) 를 거친 뒤, html-react-parser 로 React 엘리먼트 트리로 변환한다.
// sanitize 단계에서 이미 링크(target/rel, INV-D4)·이미지(alt, INV-D5)가 강제된다.

export function ArticleBody({ html }: { html: string }) {
  const clean = sanitizeArticleHtml(html);
  return <div className="article-body">{parse(clean)}</div>;
}
