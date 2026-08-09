import sanitizeHtml from "sanitize-html";
import { BODY_URL_SCHEMES } from "./url-safety";

// content-safety.md 강제 지점.
// 원문 HTML 은 신뢰 경계 밖(INV-D1) — 화이트리스트 방식으로만 통과시킨다(INV-D2).
// 링크는 새 탭 + noopener(INV-D4), 이미지는 alt 보장(INV-D5).
// 허용 스킴 목록은 여기서 정하지 않는다 — url-safety.ts 가 정본이다(INV-D6).
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

// ── 이미지 치수 (INV-D2, 2026-08-08 · S10~S12) ──────────────────────────────
// **값 판정 로직을 우리가 직접 쓰는 속성은 이 둘뿐이다.** (href/src 의 스킴 판정도 값을 보지만
// 그건 sanitize-html 의 allowedSchemes 가 맡고, 목록의 정본은 url-safety.ts 다 — 아래 참조.)
//
// 이 값들이 하는 일: 이미지가 도착하기 전 브라우저가 비워둘 상자를 정한다. 비율뿐 아니라
// **로드 전 렌더 폭도 정한다**(width 속성은 width 프로퍼티의 표현 힌트다). 다만 그 폭은
// article-view.module.css 의 max-width:100% 가 읽기 컬럼에서 자른다.
// 통과 조건·거부 시 동작의 정본은 스펙이다: content-safety.md INV-D2.

/** HTML 의 치수 속성은 단위 없는 정수다. `704px`·`704.5`·`" 704 "`·`-1`·`0` 은 전부 여기서 걸린다. */
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

/**
 * 치수 하나의 절대 상한(px). 브라우저가 실제로 다루는 이미지 크기의 실용 한계 언저리이고,
 * 이보다 크면 실측값이 아니라 잘못된 값이다. 근거: content-safety.md INV-D2 조건 4.
 *
 * 비율 상한만으로는 절대 크기가 안 묶인다 — 10:1 을 지키면서 자릿수만 키운 값이 통과한다.
 * 그 값이 지금 화면을 안 망가뜨리는 건 CSS 의 height:auto 덕인데, 방어가 다른 레이어에
 * 얹혀 있으면 그 한 줄이 사라지는 날 조용히 깨진다. sanitize 층에서 스스로 묶는다.
 */
const MAX_DIMENSION = 20000;

/**
 * 자리 예약을 해줄 만한 비율의 상한. 근거: content-safety.md INV-D2 조건 3.
 * (요약: 정수 검사만으로는 `width="1" height="99999"` 같은 거짓 치수를 못 막는데,
 *  그걸 믿고 자리를 비우면 높이 0 에서 튀어오르는 것보다 나쁜 빈 공간이 생긴다.)
 */
const MAX_RATIO = 10;

/** 자리 예약에 쓸 수 있는 치수 쌍이면 그대로, 아니면 null (→ 둘 다 버린다). */
function reservableSize(
  attribs: sanitizeHtml.Attributes,
): { width: string; height: string } | null {
  const { width, height } = attribs;
  // 하나만 있으면 브라우저가 비율을 구하지 못한다 — 남겨봐야 얻는 게 없다.
  if (typeof width !== "string" || typeof height !== "string") return null;
  if (!POSITIVE_INTEGER.test(width) || !POSITIVE_INTEGER.test(height)) return null;

  const w = Number(width);
  const h = Number(height);
  // 상한이 안전 정수 범위보다 한참 낮으므로 정밀도를 잃는 자릿수는 여기서 함께 걸린다.
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) return null;
  if (w / h > MAX_RATIO || h / w > MAX_RATIO) return null;

  return { width, height };
}

export function sanitizeArticleHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      // width·height 는 이름만으로 통과하지 않는다 — 아래 transformTags.img 가 값을 보고
      // 조건을 못 맞추면 둘 다 지운 뒤에야 이 필터에 도달한다.
      img: ["src", "alt", "title", "width", "height"],
      "*": [],
    },
    // href/src 는 안전한 스킴만 — javascript: 등은 속성째 제거 (INV-D2 실패경로)
    allowedSchemes: [...BODY_URL_SCHEMES],
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
      // INV-D2(S10/S11): 치수는 쌍으로만 산다. 조건을 못 맞추면 한쪽만 남기지 않고 둘 다 버린다.
      img: (tagName, attribs) => {
        // 치수는 쌍으로만 산다 — 조건 미달이면 reservableSize 가 null 이라 아무것도 안 붙는다.
        // 원본에 있던 width/height 는 rest 에서 빠지므로 여기서만 되살아난다.
        const { width: _w, height: _h, ...rest } = attribs;
        void _w;
        void _h;
        return {
          tagName,
          attribs: { ...rest, alt: attribs.alt ?? "", ...reservableSize(attribs) },
        };
      },
    },
    // src 를 잃은 이미지는 태그째 버린다.
    // 허용 스킴이 아닌 src(`data:` 등)는 위 필터가 **속성만** 지우므로 `<img alt="">` 껍데기가 남는데,
    // 그 자리에 자리 예약(aspect-ratio)과 배경색이 걸리면 **영원히 안 채워지는 회색 상자**가 된다.
    // 치수 없는 이미지의 예약은 언젠가 그림으로 채워지지만 이 자리는 그렇지 않다 —
    // 화면이 "여기 그림이 있다"고 거짓말하게 두지 않는다(INV-D6 의 죽은 링크 판단과 같은 이유).
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}
