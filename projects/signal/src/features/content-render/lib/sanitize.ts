import sanitizeHtml from "sanitize-html";

// content-safety.md 강제 지점.
// 원문 HTML 은 신뢰 경계 밖(INV-D1) — 화이트리스트 방식으로만 통과시킨다(INV-D2).
// 링크는 새 탭 + noopener(INV-D4), 이미지는 alt 보장(INV-D5).
// 이 함수의 출력만 렌더 경로로 넘어간다(ArticleBody 는 이 결과를 파서로 렌더 — INV-D3).

const ALLOWED_TAGS = [
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "strong", "em", "b", "i", "u", "s", "mark", "small", "sub", "sup",
  "a", "img",
  "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
  "span",
];

export function sanitizeArticleHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title"],
      "*": [],
    },
    // href/src 는 안전한 스킴만 — javascript: 등은 속성째 제거 (INV-D2 실패경로)
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    // 화이트리스트 밖 태그의 내용은 남기되 태그는 벗긴다. script/style 은 내용까지 통째로 제거.
    disallowedTagsMode: "discard",
    nonTextTags: ["style", "script", "textarea", "option", "noscript"],
    transformTags: {
      // INV-D4: 모든 링크를 새 탭 + noopener noreferrer 로 강제 (탭내빙 차단)
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
      // INV-D5: alt 없는 이미지는 빈 alt(장식)로 — 스크린리더가 건너뛰게
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, alt: attribs.alt ?? "" },
      }),
    },
  });
}
