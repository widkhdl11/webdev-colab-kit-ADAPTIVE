import type { PricedTier } from "../model/price-table";
import type { ChargeBreakdown } from "../model/charge";
import type { PendingPayment } from "../model/confirm";

/** 주문번호가 이미 있다 — 등록이 새 번호로 다시 시도한다. */
export class OrderNoTakenError extends Error {
  constructor() {
    super("이미 있는 주문번호");
  }
}

/** DB 등록 함수가 넘겨받은 금액을 거부했다 — 앱이 요금표를 읽은 뒤 등록하기 전에 대표가 요금을 바꿨다(admin-console INV-K3). */
export class PriceChangedError extends Error {
  constructor() {
    super("등록 순간의 요금표와 금액이 다르다");
  }
}

/** DB 등록 함수가 보내는 사람을 거부했다 — 자기 자신(self)·팔로우 없음(no_follow)·보낼 수 없는 계정(role)·받을 수 없는 크리에이터(unknown_creator — 없거나 본인 확인 전)·
 * 받는 크리에이터가 채널 이사 중(moving — creator-verification INV-V12, 이것만은 DB 만 판정하는 정상 경로다).
 * 앱 서버 판정이 먼저 막으므로 정상 흐름에서는 나오지 않는다. 나오면 서버 판정이 빠진 것이다(INV-L3·L8·L9 두 번째 장치). */
export class SenderRefusedError extends Error {
  constructor(readonly reason: "role" | "self" | "no_follow" | "unknown_creator" | "moving") {
    super(`DB 가 보내는 사람을 거부했다: ${reason}`);
  }
}

/** 결제 대기와 같이 저장되는 선물 등록 내용. fanId 는 보내는 사람(팬 또는 크리에이터) — 서버가 확인한 로그인 사용자다(INV-L3). */
export type GiftRegistration = {
  fanId: string;
  creatorId: string;
  itemKind: string;
  hasElectronicsOrMetal: boolean;
  boxes: PricedTier[];
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
