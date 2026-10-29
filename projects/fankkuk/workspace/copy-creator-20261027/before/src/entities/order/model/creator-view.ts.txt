import type { PriorGiftHistory } from "./prior-history";

// 크리에이터 승인 요청 한 건. 원본 「팬이 보는 것 / 크리에이터가 보는 것」 표의 등록 단계:
// 팬 닉네임과 팬이 입력한 물품 종류. 팬의 송장번호·결제 정보는 넣지 않는다.
export type ApprovalRequestView = {
  /** 승인 요청 식별값 — 거절할 때 이것 하나만 서버로 보낸다(decline-block INV-D1). 보낸 사람 계정 값은 화면에 오지 않는다. */
  requestId: string;
  orderNo: string;
  fanNickname: string;
  itemKind: string;
  boxCount: number;
  hasElectronicsOrMetal: boolean;
  registeredAt: string;
  receivedAt: string | null;
  /** 이 팬이 이 크리에이터에게 보낸 지난 주문의 검수 내역(decline-block INV-D11). 다른 크리에이터에게 보낸 주문은 세지 않는다. */
  priorHistory: PriorGiftHistory;
};
