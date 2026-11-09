import { z } from "zod";

// 선물함 상태(revgift-box INV-GB1)와 신청 상태(INV-GB2). 상태를 바꾸는 것은 DB 전환 함수뿐이고, 여기서는 이름과 화면 표기만 둔다.
// 화면 표기는 docs/ux/pages/creator-revgifts-new.md 상태 전이표의 「화면 표기」를 따른다.

export const BOX_STATUSES = ["open", "closed", "awaiting_box", "arrived", "held", "invoiced", "overdue", "paid", "returning", "returned", "done", "cancelled"] as const;
export type BoxStatus = (typeof BOX_STATUSES)[number];
export const boxStatusSchema = z.enum(BOX_STATUSES);

export const BOX_STATUS_NAME: Record<BoxStatus, string> = {
  open: "신청 받는 중",
  closed: "마감",
  awaiting_box: "팬꾹으로 배송하기", // 2026-11-09 사용자 「상자보내주세요 -> 팬꾹으로 배송하기로 바꿔주고」
  arrived: "도착 · 실측 중",
  held: "확인 필요",
  invoiced: "결제 요청",
  overdue: "결제 기한 지남",
  paid: "발송 중",
  returning: "착불 반송",
  returned: "반송됨",
  done: "완료",
  cancelled: "취소",
};

// waitlisted 대기(2026-11-09 개정, INV-GB2·GB5) — 정원이 찬 뒤 들어온 신청. 정원을 차지하지 않고, 마감 때 크리에이터가 고른 것만 담긴다.
// 선물함이 신청 받는 중이 아니면 waitlisted 는 끝난 상태다(마감 때 고르지 않은 대기 신청).
export const APPLICATION_STATUSES = ["applied", "excluded", "withdrawn", "waitlisted", "selected", "measured", "missing", "rejected", "paid", "shipped", "delivered", "ended"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

/** 사무실 화면의 신청 상태 표기(출고 화면) — 크리에이터·팬 화면에는 쓰지 않는다 */
export const APPLICATION_STATUS_OFFICE_NAME: Record<ApplicationStatus, string> = {
  applied: "신청",
  excluded: "제외",
  withdrawn: "신청 취소",
  waitlisted: "대기",
  selected: "담길 차례",
  measured: "실측됨",
  missing: "도착 안 함",
  rejected: "보낼 수 없음",
  paid: "결제 완료",
  shipped: "출고",
  delivered: "배송 완료",
  ended: "끝남",
};

/** 크리에이터 신청 관리 창에서 「제외」로 보이는가 — 제외된 줄은 흐리게 목록에 남는다(INV-GB7) */
export function isExcluded(status: ApplicationStatus): boolean {
  return status === "excluded";
}

/** 크리에이터 신청 관리 창에서 「대기」로 보이는가 — 신청 받는 중인 선물함의 대기 신청(INV-GB5). 마감 뒤에는 끝난 상태다 */
export function isWaitlisted(status: ApplicationStatus, boxStatus: BoxStatus): boolean {
  return status === "waitlisted" && boxStatus === "open";
}

/** 팬에게 보이는 내 신청 — 제외 여부는 드러내지 않는다(정할 것 Q6). waitlisted = 신청 받는 중인 선물함의 대기(자기 순번은 따로, INV-GB9) */
export const FAN_BOX_STATES = ["none", "applied", "waitlisted", "preparing", "closed", "cancelled"] as const;
export type FanBoxState = (typeof FAN_BOX_STATES)[number];

/** 팬 화면을 보는 사람 — guest 로그인 안 함 · owner 선물함 주인 · not_fan 팬 계정 아님 · follower · not_follower */
export const BOX_VIEWERS = ["guest", "owner", "not_fan", "follower", "not_follower"] as const;
export type BoxViewer = (typeof BOX_VIEWERS)[number];

/** 착불 반송의 까닭 — unpaid 명세서 결제 없음(INV-GB19) · all_missing 모든 신청이 도착 안 함, 명세서 없음(INV-GB11 · Q12) */
export const RETURN_REASONS = ["unpaid", "all_missing"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
/** 사무실 반송 목록의 까닭 표기 */
export const RETURN_REASON_NAME: Record<ReturnReason, string> = {
  unpaid: "결제 없음",
  all_missing: "모두 도착 안 함",
};
