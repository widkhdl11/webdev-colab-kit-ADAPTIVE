// 선물 링크용 아이디 (creator-link INV-E2·E3·E5).
// 저장 검사(꼴·예약어·본인 로그인 아이디·잠금·중복)의 정본은 DB 함수 update_my_creator_handle 이다 — 여기서는 화면이 미리 보는 꼴과
// 주소로 들어왔을 때 어디로 보낼지만 정한다.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
/** 정하거나 바꾸면 다시 바꿀 수 없는 날 수(INV-E4) — DB 함수와 같다. */
export const HANDLE_LOCK_DAYS = 30;
/** 바꾼 옛 아이디가 그 크리에이터에게 묶여 있는 날 수(INV-E3) — DB 함수와 같다. */
export const HANDLE_RETIRE_DAYS = 90;
/** 링크 주소에 보이는 사이트 이름. */
export const LINK_HOST = "fankkuk.kr";

const SHAPE = /^[a-z0-9_]{3,20}$/;

/** 앞뒤 공백을 빼고 소문자로 — DB 함수도 같은 순서로 바꾼 뒤 검사한다(INV-E2). */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 소문자로 바꾼 뒤의 꼴인가(영문 소문자·숫자·밑줄 3~20자). */
export function isHandleShape(handle: string): boolean {
  return SHAPE.test(handle);
}

/** 고쳐 쓴 값이 지금 아이디와 같은가 — 저장 때와 같은 정리(normalizeHandle) 뒤에 비교한다. 아이디가 없으면 늘 다르다. */
export function isSameHandle(draft: string, current: string | null): boolean {
  return current !== null && normalizeHandle(draft) === current;
}

/** 화면에 보이는 링크 주소(fankkuk.kr/haru). */
export function linkText(handle: string): string {
  return `${LINK_HOST}/${handle}`;
}

/** 링크 주소의 경로(/haru). */
function linkPath(handle: string): string {
  return `/${handle}`;
}

/** 크리에이터 페이지로 가는 주소 — 아이디가 있으면 링크 주소, 없으면 옛 페이지 주소(INV-E5). */
export function creatorPagePath(c: { id: string; handle: string | null }): string {
  return c.handle ? linkPath(c.handle) : `/creators/${c.id}`;
}

/** 공지 이미지를 내려받을 수 있는가 — 링크 주소가 있고 본인 확인을 마쳤을 때만(INV-E10. 본인 확인 전에는 링크가 열리지 않는다, INV-E5). */
export function canDownloadNotice(c: { handle: string | null; verified: boolean }): boolean {
  return c.handle !== null && c.verified;
}

/** DB 가 찾은 아이디 — creatorId 와 그 크리에이터의 지금 아이디. 없거나 본인 확인 전이면 null. */
export type ResolvedHandle = { creatorId: string; handle: string };

export type LinkRoute = { kind: "redirect"; to: string } | { kind: "not_found" } | { kind: "show"; creatorId: string };

/**
 * 링크 주소(/{아이디})로 들어왔을 때.
 * - 대문자가 섞였으면 찾기 전에 소문자 주소로 넘긴다(INV-E2 S2b).
 * - 꼴이 틀렸거나 찾지 못했으면 없는 페이지(INV-E5 S5b).
 * - 묶인 옛 아이디로 찾았으면 지금 아이디 주소로 넘긴다(INV-E3 S3b).
 */
export function linkRouteOf(param: string, resolved: ResolvedHandle | null): LinkRoute {
  const lower = param.toLowerCase();
  if (lower !== param && isHandleShape(lower)) return { kind: "redirect", to: linkPath(lower) };
  if (!isHandleShape(param) || !resolved) return { kind: "not_found" };
  if (resolved.handle !== param) return { kind: "redirect", to: linkPath(resolved.handle) };
  return { kind: "show", creatorId: resolved.creatorId };
}

/** 옛 페이지 주소(/creators/{id})로 들어왔을 때 — 아이디가 있으면 링크 주소로 넘기고, 없으면 그 주소가 그대로 페이지다(INV-E5 S5). */
export function oldPageRouteOf(c: { handle: string | null }): { kind: "redirect"; to: string } | { kind: "show" } {
  return c.handle ? { kind: "redirect", to: linkPath(c.handle) } : { kind: "show" };
}
