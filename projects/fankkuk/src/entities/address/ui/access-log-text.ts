import type { AccessDenyReason, AccessRequester } from "../model/access-log";

// 열람 기록의 사람 말 — 크리에이터 열람 기록(INV-P7)과 팬의 몫 열람 기록(reverse-gift INV-R16)이 같이 쓴다.

/** 거부 사유 → 문구. */
export const ACCESS_DENY_TEXT: Record<AccessDenyReason, string> = {
  not_owner: "대표 계정이 아니라 열리지 않았어요",
  no_valid_approval: "승인 서명이 확인되지 않아 열리지 않았어요",
  order_mismatch: "서명한 주문과 달라 열리지 않았어요",
  order_not_printable: "지금은 주소를 열 수 없는 단계라 열리지 않았어요",
  difference_unpaid: "차액이 결제되지 않아 열리지 않았어요",
  decrypt_limit_reached: "출력 횟수를 다 써서 열리지 않았어요",
  address_mismatch: "주소 주인이 맞지 않아 송장에 쓰지 않았어요",
};

/** 누가 — 계정 id·아이디·닉네임 없이 대표인지 아닌지만(INV-P8). */
export const ACCESS_REQUESTER_TEXT: Record<AccessRequester, string> = { owner: "대표 계정", other: "대표가 아닌 계정" };
