import { LINK_HOST } from "./creator-handle";

// 팬꾹 링크 게시 확인의 판정 (creator-verification INV-V18). 운영자 화면이 보여 주는 「찾을 링크」와 반려 사유가 이 규칙을 따르고,
// 2차의 공개 페이지 자동 찾기도 이 함수 하나를 쓴다(서버 판정 함수 하나).
//
// (2) 링크가 같다고 보는 것: `<사이트 주소>/<아이디>` 에 https://·http://·www. 가 붙거나 빠진 것, 끝의 / 하나, 아이디 대소문자만 다른 것.
//     반려: 도메인만 · 다른 경로 · 다른 아이디(묶인 옛 아이디 포함 — 비교 대상은 요청 줄의 아이디 하나) · ?·# 가 붙은 주소 · 단축 주소·링크 모음.
// (1) 채널 이름이 같다고 보는 것: 앞뒤 공백과 영문 대소문자 차이만. 팬꾹 닉네임은 비교하지 않는다.

/** 링크로 받는 사이트 주소. 화면에 보이는 LINK_HOST 와 사이트의 실제 주소(fankkuk.com)를 함께 받는다 — 둘 다 팬꾹 주소다. */
const SITE_HOSTS: ReadonlySet<string> = new Set([LINK_HOST, "fankkuk.com"]);

const LINK_SHAPE = /^(?:https?:\/\/)?(?:www\.)?([^/?#\s]+)\/([^/?#\s]+)\/?$/i;

/** 채널 공개 페이지의 링크 칸에 걸린 주소(found)가 요청 줄의 아이디(handle)로 만든 팬꾹 링크와 같은가. */
export function isSameGiftLink(found: string, handle: string): boolean {
  const m = LINK_SHAPE.exec(found.trim());
  if (!m) return false;
  const host = m[1].toLowerCase();
  const id = m[2];
  return SITE_HOSTS.has(host) && id.toLowerCase() === handle.toLowerCase();
}

/** 공개 페이지의 채널 이름(found)이 가입 때 적은 채널 이름(registered)과 같은가 — 앞뒤 공백과 영문 대소문자 차이만 같은 것으로 본다. */
export function isSameChannelName(found: string, registered: string): boolean {
  return asciiLower(found.trim()) === asciiLower(registered.trim());
}

function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** 운영자 화면에 보이는 찾을 링크(fankkuk.kr/haru 꼴). */
export function giftLinkText(handle: string): string {
  return `${LINK_HOST}/${handle}`;
}
