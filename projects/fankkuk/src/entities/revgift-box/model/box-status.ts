import { z } from "zod";

// 선물함 상태(revgift-box INV-GB1)와 신청 상태(INV-GB2). 상태를 바꾸는 것은 DB 전환 함수뿐이고, 여기서는 이름과 화면 표기만 둔다.
// 화면 표기는 docs/ux/pages/creator-revgifts-new.md 상태 전이표의 「화면 표기」를 따른다.

export const BOX_STATUSES = ["open", "closed", "awaiting_box", "arrived", "held", "invoiced", "overdue", "paid", "returning", "returned", "done", "cancelled"] as const;
export type BoxStatus = (typeof BOX_STATUSES)[number];
export const boxStatusSchema = z.enum(BOX_STATUSES);

export const BOX_STATUS_NAME: Record<BoxStatus, string> = {
  open: "신청 받는 중",
  closed: "마감",
  awaiting_box: "상자 보내 주세요",
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

export const APPLICATION_STATUSES = ["applied", "excluded", "selected", "measured", "missing", "rejected", "paid", "shipped", "delivered", "ended"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

/** 크리에이터 신청 관리 창에서 「제외」로 보이는가 — 제외된 줄은 흐리게 목록에 남는다(INV-GB7) */
export function isExcluded(status: ApplicationStatus): boolean {
  return status === "excluded";
}

/** 팬에게 보이는 내 신청 — 제외 여부는 드러내지 않는다(정할 것 Q6) */
export const FAN_BOX_STATES = ["none", "applied", "preparing", "closed", "cancelled"] as const;
export type FanBoxState = (typeof FAN_BOX_STATES)[number];

/** 팬 화면을 보는 사람 — guest 로그인 안 함 · owner 선물함 주인 · not_fan 팬 계정 아님 · follower · not_follower */
export const BOX_VIEWERS = ["guest", "owner", "not_fan", "follower", "not_follower"] as const;
export type BoxViewer = (typeof BOX_VIEWERS)[number];
