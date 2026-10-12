import type { AccessDenyReason, AccessRequester } from "../model/access-log";

// 거부 줄의 사람 말 — 운영자 내부 열람 기록(INV-P7)이 쓴다. 크리에이터·팬 열람 기록에는 거부 줄이 가지 않는다(2026-10-12 문제집 D12).
// not_owner 문구(C1 「권한이 없는 계정이라 열리지 않았어요」)는 직원이 보는 관리자 화면에 남는다.

/** 거부 사유 → 문구. */
export const ACCESS_DENY_TEXT: Record<AccessDenyReason, string> = {
  not_owner: "권한이 없는 계정이라 열리지 않았어요",
  no_valid_approval: "승인 서명이 확인되지 않아 열리지 않았어요",
  order_mismatch: "서명한 주문과 달라 열리지 않았어요",
  order_not_printable: "지금은 주소를 열 수 없는 단계라 열리지 않았어요",
  difference_unpaid: "차액이 결제되지 않아 열리지 않았어요",
  decrypt_limit_reached: "출력 횟수를 다 써서 열리지 않았어요",
  address_mismatch: "주소 주인이 맞지 않아 송장에 쓰지 않았어요",
};

/** 역조공 몫의 두 사유는 팬 선물과 뜻이 달라 바꿔 쓴다 — 받는 팬 화면이 쓰던 문구와 같다(reverse-gift INV-R7 a·b). 나머지 사유는 ACCESS_DENY_TEXT. */
export const REVGIFT_ACCESS_DENY_TEXT: Partial<Record<AccessDenyReason, string>> = {
  no_valid_approval: "받기로 하며 입력한 주소가 없어 열리지 않았어요",
  order_mismatch: "다른 선물의 주소라 열리지 않았어요",
};

/** 운영자 내부 기록의 「누가」 — 대표 계정인지 아닌지(INV-P8). 닉네임은 따로 붙인다. */
export const ACCESS_REQUESTER_TEXT: Record<AccessRequester, string> = { owner: "대표", other: "대표 아님" };
