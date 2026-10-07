import { tagKey } from "./creator-tags";

// 태그 선택지 이름 → 아이콘·플랫폼 색 대응표 (design-rules 5절 「크리에이터 태그 아이콘·플랫폼 색」, 시안 v9-pages/tags-b.html).
// 이 표가 정본이다 — 찾기·크리에이터 페이지·메인·가입/설정·팔로우 목록이 모두 여기서 읽는다.
// 아이콘 파일은 public/brand/ (출처 public/brand/SOURCES.md). 로고 모양·색은 바꾸지 않는다.
// 색은 플랫폼마다 다른 데이터라 토큰이 아니라 표에 둔다(얼굴 색 faceTone 과 같은 이유). 값은 시안 그대로:
//   ring = 고른 칩의 2px 테두리(브랜드 원색) · fill = 옅은 브랜드 면 · ink = 면 위 글자(브랜드 색을 어둡게 맞춰 대비 4.5 이상).
// 이름이 표에 없으면(운영자가 새로 넣은 선택지) null — 화면은 아이콘 없는 기본 칩을 그린다.

/** 아이콘 모양 — app = 공식 앱 아이콘 그림 그대로 · glyph = 브랜드 색 둥근 네모 위 흰 글리프 · virtual = 중립 선 그림. */
export type TagIcon =
  | { kind: "app"; src: string }
  | { kind: "glyph"; src: string; background: string }
  | { kind: "virtual" };

export type TagBrand = { icon: TagIcon; ring: string; fill: string; ink: string };

const INSTAGRAM_GRADIENT = "radial-gradient(circle at 30% 107%, #FDF497 0%, #FDF497 5%, #FD5949 45%, #D6249F 60%, #285AEB 90%)";
const NEUTRAL = { fill: "#F2F2F3", ink: "#343039" } as const;

// 키는 tagKey 로 정리한 선택지 이름(문자열 값). 객체 키 대신 Map 을 쓴다 — 식별자·객체 키는 ASCII 로 쓰는 규칙.
const TAG_BRANDS: ReadonlyMap<string, TagBrand> = new Map<string, TagBrand>([
  ["soop", { icon: { kind: "app", src: "/brand/soop.png" }, ring: "#0890F8", fill: "#EAF5FE", ink: "#0B5CAD" }],
  ["치지직", { icon: { kind: "app", src: "/brand/chzzk.png" }, ring: "#00FFA3", fill: "#E6FFF5", ink: "#006B47" }],
  ["유튜브", { icon: { kind: "glyph", src: "/brand/youtube.svg", background: "#FF0000" }, ring: "#FF0000", fill: "#FFECEC", ink: "#C00000" }],
  ["알플레이", { icon: { kind: "app", src: "/brand/rplay.png" }, ring: "#20A8E0", fill: "#E8F6FC", ink: "#0A6A96" }],
  ["인스타그램", { icon: { kind: "glyph", src: "/brand/instagram.svg", background: INSTAGRAM_GRADIENT }, ring: "#FF0069", fill: "#FFEBF3", ink: "#B8004D" }],
  ["x", { icon: { kind: "glyph", src: "/brand/x.svg", background: "#000000" }, ring: "#000000", ...NEUTRAL }],
  ["스레드", { icon: { kind: "glyph", src: "/brand/threads.svg", background: "#000000" }, ring: "#000000", ...NEUTRAL }],
  ["틱톡", { icon: { kind: "glyph", src: "/brand/tiktok.svg", background: "#000000" }, ring: "#000000", ...NEUTRAL }],
  ["버추얼", { icon: { kind: "virtual" }, ring: "#665D65", ...NEUTRAL }],
]);

/** 선택지 이름의 아이콘·색. 이름 비교는 tagKey(앞뒤 공백·영문 대소문자 무시 — DB 와 같다). 표에 없으면 null. */
export function tagBrandOf(name: string): TagBrand | null {
  return TAG_BRANDS.get(tagKey(name)) ?? null;
}
