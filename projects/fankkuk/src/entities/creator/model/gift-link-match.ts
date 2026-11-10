import { LINK_HOST } from "./creator-handle";

// 팬꾹 링크 게시 확인의 판정 (creator-verification INV-V18). 운영자 화면이 보여 주는 「찾을 링크」와 반려 사유가 이 규칙을 따르고,
// 2차의 공개 페이지 자동 찾기도 이 함수 하나를 쓴다(서버 판정 함수 하나).
//
// 링크가 같다고 보는 것: `<사이트 주소>/<아이디>` 에 https://·http://·www. 가 붙거나 빠진 것, 끝의 / 하나, 아이디 대소문자만 다른 것.
//     반려: 도메인만 · 다른 경로 · 다른 아이디(묶인 옛 아이디 포함 — 비교 대상은 요청 줄의 아이디 하나) · ?·# 가 붙은 주소 · 단축 주소·링크 모음.
// 이름(채널 이름·닉네임)은 대조하지 않는다(2026-11-10, creator-display-name INV-CN4).

/** 링크로 받는 사이트 주소 — 팬꾹 주소는 fankkuk.com 하나다(2026-11-04 사용자 「애초에 .com 밖에 없어」). 예전 화면 표기 fankkuk.kr 은 열리지 않는 주소라 받지 않는다. */
const SITE_HOSTS: ReadonlySet<string> = new Set([LINK_HOST]);

const LINK_SHAPE = /^(?:https?:\/\/)?(?:www\.)?([^/?#\s]+)\/([^/?#\s]+)\/?$/i;

/** 채널 공개 페이지의 링크 칸에 걸린 주소(found)가 요청 줄의 아이디(handle)로 만든 팬꾹 링크와 같은가. */
export function isSameGiftLink(found: string, handle: string): boolean {
  const m = LINK_SHAPE.exec(found.trim());
  if (!m) return false;
  const host = m[1].toLowerCase();
  const id = m[2];
  return SITE_HOSTS.has(host) && id.toLowerCase() === handle.toLowerCase();
}

/** 운영자 화면에 보이는 찾을 링크(fankkuk.com/haru 꼴). */
export function giftLinkText(handle: string): string {
  return `${LINK_HOST}/${handle}`;
}
