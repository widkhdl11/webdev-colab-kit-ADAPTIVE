// 함께한 시간 주소 `/gifts/with/{크리에이터의 링크 주소 또는 ID}` (together 「스스로 정한 것」).
// 주소는 누구 기록인지를 정하지 않는다 — 내용은 로그인한 사람의 주문에서만 DB 읽기 함수가 만든다(INV-F1).
// 링크 주소 꼴은 크리에이터 링크와 같다(creator-link INV-E2 — 영문 소문자·숫자·밑줄 3~20자).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HANDLE = /^[a-z0-9_]{3,20}$/;

/** 「선물 내역」 전체 목록 주소 — 크리에이터가 한 명이어도 함께한 시간으로 넘기지 않는다. */
export const ALL_GIFTS_PATH = "/gifts?view=all";

export function togetherPath(c: { id: string; handle: string | null }): string {
  return `/gifts/with/${c.handle ?? c.id}`;
}

export type TogetherKey = { kind: "id"; creatorId: string } | { kind: "handle"; handle: string } | { kind: "invalid" };

export function parseTogetherKey(raw: string): TogetherKey {
  if (UUID.test(raw)) return { kind: "id", creatorId: raw };
  if (HANDLE.test(raw)) return { kind: "handle", handle: raw };
  return { kind: "invalid" };
}
