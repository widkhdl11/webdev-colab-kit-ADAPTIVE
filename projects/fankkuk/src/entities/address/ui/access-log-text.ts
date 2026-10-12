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

/** 운영자 내부 기록의 「누가」 — 대표 계정인지 아닌지(INV-P8). 닉네임은 따로 붙인다. */
export const ACCESS_REQUESTER_TEXT: Record<AccessRequester, string> = { owner: "대표", other: "대표 아님" };
