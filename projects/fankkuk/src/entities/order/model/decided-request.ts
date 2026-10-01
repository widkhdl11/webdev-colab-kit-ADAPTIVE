// 크리에이터가 이미 처리한 요청의 모양 — 「처리한 요청」 탭이 받는다.
// 승인 요청 모양(ApprovalRequestView)처럼 크리에이터가 봐도 되는 것만 담는다 — 팬 송장번호·결제 정보·주소는 없다.

/** approved = 서명으로 승인 / declined = 받지 않음 / blocked = 받지 않으며 팬 차단 / expired = 기한 안에 정하지 않아 자동 반려 */
export type DecidedOutcome = "approved" | "declined" | "blocked" | "expired";

export type DecidedRequestView = {
  orderNo: string;
  fanNickname: string;
  itemKind: string;
  boxCount: number;
  outcome: DecidedOutcome;
  decidedAt: string;
};
