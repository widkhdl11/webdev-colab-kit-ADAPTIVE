import type { BillableTier } from "../config/tier-pricing";
import type { ChargeBreakdown } from "../model/charge";
import type { PendingPayment } from "../model/confirm";

/** 주문번호가 이미 있다 — 등록이 새 번호로 다시 시도한다. */
export class OrderNoTakenError extends Error {
  constructor() {
    super("이미 있는 주문번호");
  }
}

/** 결제 대기와 같이 저장되는 선물 등록 내용. fanId 는 서버가 확인한 로그인 사용자다(INV-L3). */
export type GiftRegistration = {
  fanId: string;
  creatorId: string;
  itemKind: string;
  hasElectronicsOrMetal: boolean;
  boxes: BillableTier[];
};

/** 결제가 끝나는 순간 같이 만드는 승인 요청(INV-M6). 원문은 buildSigningPayload 가 만든다(INV-S1). */
export type ApprovalRequestDraft = { requestId: string; payload: string; requestedAt: string };

export type StoredPayment = PendingPayment & {
  orderNo: string;
  charge: ChargeBreakdown;
  paymentKey: string | null;
  /** 이 결제를 등록한 팬 — 결제 승인은 이 팬의 요청만 처리한다(INV-L3). */
  fanId: string;
  /** 서명 원문의 팬 닉네임 해시를 만드는 데만 쓴다 — 원문에는 해시만 들어간다. */
  fanNickname: string;
};

/**
 * 결제 기록 저장소의 경계. DB 구현(supabase-payment-store)과 시험용 메모리 구현이 같은 계약을 따른다.
 * create 는 주문·상자·결제 대기를 한 번에 만든다.
 * claim 은 "결제 대기 → 승인 중" 전환을 한 번만 허용한다 — 승인 API 를 두 번 부르지 않는 장치(INV-M5).
 * settle 의 done 은 같은 처리 안에서 주문을 등록 상태로 넘기고 승인 요청을 만든다(INV-M6).
 * settle 은 이번 호출이 실제로 기록을 바꿨는지 돌려준다 — 이미 끝난 결제면 false.
 */
export interface PaymentStore {
  create(input: { orderId: string; orderNo: string; charge: ChargeBreakdown; registration: GiftRegistration }): Promise<StoredPayment>;
  find(orderId: string): Promise<StoredPayment | null>;
  claim(orderId: string): Promise<boolean>;
  settle(
    orderId: string,
    outcome: { status: "done"; paymentKey: string; approvalRequest: ApprovalRequestDraft } | { status: "failed" },
  ): Promise<boolean>;
}
