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

/** DB 등록 함수가 입력 값(메모·기타 글 길이 등, 22023)을 거부했다 — 입력 검사가 먼저 막으므로 정상 흐름에서는 나오지 않지만, 나오면 입력 오류(400)다. */
export class InvalidRegistrationError extends Error {
  constructor(detail: string) {
    super(`DB 가 등록 입력을 받지 않았다: ${detail}`);
  }
}

/** DB 등록 함수가 보내는 사람을 거부했다 — 자기 자신(self)·팔로우 없음(no_follow)·보낼 수 없는 계정(role)·받을 수 없는 크리에이터(unknown_creator — 없거나 본인 확인 전)·
 * 받는 크리에이터가 채널 이사 중(moving — creator-verification INV-V12, 이것만은 DB 만 판정하는 정상 경로다)·
 * 쉬는 중(resting — creator-receiving INV-B2)·이번 달 한도(limit — INV-B4)·받기 어려운 품목 등록 막기(hard_item — hard-items INV-H7) — 이 셋도 DB 가 판정하는 정상 경로다.
 * 앱 서버 판정이 먼저 막으므로 정상 흐름에서는 나오지 않는다. 나오면 서버 판정이 빠진 것이다(INV-L3·L8·L9 두 번째 장치). */
export class SenderRefusedError extends Error {
  constructor(readonly reason: "role" | "self" | "no_follow" | "unknown_creator" | "moving" | "resting" | "limit" | "hard_item" | "unsigned") {
    super(`DB 가 보내는 사람을 받지 않았다: ${reason}`);
  }
}

/** 결제 대기와 같이 저장되는 선물 등록 내용. fanId 는 보내는 사람(팬 또는 크리에이터) — 서버가 확인한 로그인 사용자다(INV-L3). */
export type GiftRegistration = {
  fanId: string;
  creatorId: string;
  /** 물품 종류 코드(hard-items INV-H1) — DB 등록 함수가 목록으로 다시 검사하고 물품 이름을 정한다 */
  itemCategory: string;
  /** 기타일 때만 팬이 적은 글, 아니면 null */
  itemOther: string | null;
  hasElectronicsOrMetal: boolean;
  boxes: PricedTier[];
  /** 팬이 고른 「{기념일} 선물」 표시 — 7일 안인지는 DB 등록 함수가 그날 다시 계산한다(creator-receiving INV-B9). 고르지 않았으면 null. */
  anniversaryName: string | null;
  /** 받기 어려운 품목 안내가 뜬 품목(metrics INV-Q5). DB 등록 함수가 그때 살아 있는 받기 어려운 품목에 있을 때만 남긴다. 안내가 없었으면 null. */
  hardNoticeCategory: string | null;
  /** 나만 보는 메모(together INV-F7) — 등록과 같은 처리로 따로 된 표에 저장된다. 안 적었으면 null(또는 없음). 물품 이름(itemOther)과 섞지 않는다. */
  memo?: { title: string | null; body: string | null } | null;
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
