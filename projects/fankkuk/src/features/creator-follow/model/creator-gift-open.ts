import type { Viewer } from "@/entities/session/model/viewer";

/**
 * 크리에이터가 다른 크리에이터에게 선물 보내기 — 지금은 닫아 둔다(2026-11-11 사용자 「지금 손볼 게 많아서 아직은 굳이 만들 필요가 없다」).
 * 다시 열 때는 이 값만 true 로 바꾼다. 닫힌 동안: 크리에이터 메뉴의 「다른 크리에이터에게 선물」 없음 · /gifts/new 는 크리에이터 홈으로 ·
 * 크리에이터 찾기·크리에이터 페이지·팔로우한 크리에이터의 「선물 보내기」 버튼 없음(팔로우는 그대로).
 * 막는 곳은 화면뿐이다 — 주문 등록 DB 함수는 그대로 크리에이터 보내기를 받는다.
 */
export const CREATOR_TO_CREATOR_GIFT_OPEN = false;

/** 이 사람에게 「선물 보내기」를 보여 주는가 — 팬·로그인 전·운영자는 늘 true, 크리에이터는 위 값을 따른다 */
export function giftSendOpenFor(viewer: Pick<Viewer, "role"> | null): boolean {
  return viewer?.role !== "creator" || CREATOR_TO_CREATOR_GIFT_OPEN;
}
