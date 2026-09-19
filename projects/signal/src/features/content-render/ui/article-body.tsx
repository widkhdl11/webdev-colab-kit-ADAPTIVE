import parse, {
  domToReact,
  Element,
  type DOMNode,
  type HTMLReactParserOptions,
} from "html-react-parser";
import { sanitizeArticleHtml } from "../lib/sanitize";

// content-safety.md INV-D3: 원문 HTML 을 raw-HTML 주입 API 없이 렌더한다(스펙 참조).
// sanitize(화이트리스트) 를 거친 뒤, html-react-parser 로 React 엘리먼트 트리로 변환한다.
// sanitize 단계에서 이미 링크(target/rel, INV-D4)·이미지(alt, INV-D5)가 강제된다.
//
// 여기서 하는 일이 하나 더 있다: **가로로 넘치는 것에 키보드 손잡이를 달아준다.**
// 표와 코드 블록은 읽기 컬럼(704px)을 넘길 수 있어 가로 스크롤이 생기는데, 스크롤 영역이
// 마우스로만 닿으면 키보드 사용자는 오른쪽을 영영 못 본다(WCAG 2.1.1).
// 원문에는 class 를 붙일 수 없으므로(sanitize 가 속성을 버린다) 껍데기는 여기서 끼운다.
// 모양은 widgets/article-view 의 .prose 가 `[data-table-scroll]` 로 잡는다 —
// 데이터 속성이라 CSS 모듈 해싱과 무관하다.

const options: HTMLReactParserOptions = {
  replace: (node) => {
    if (!(node instanceof Element)) return undefined;

    if (node.name === "table") {
      return (
        <div
          data-table-scroll=""
          role="region"
          aria-label="표 — 좌우로 스크롤할 수 있습니다"
          tabIndex={0}
        >
          <table>{domToReact(node.children as DOMNode[], options)}</table>
        </div>
      );
    }

    if (node.name === "pre") {
      return <pre tabIndex={0}>{domToReact(node.children as DOMNode[], options)}</pre>;
    }

    return undefined;
  },
};

export function ArticleBody({ html }: { html: string }) {
  const clean = sanitizeArticleHtml(html);
  // 감싸는 div 만 두고 클래스는 두지 않는다 — 모양은 이 조각을 쓰는 화면이
  // .prose 후손 선택자로 잡는다(원문에는 class 를 붙일 수 없으므로 그쪽이 정본이다).
  return <div>{parse(clean, options)}</div>;
}
