import { newOrderNo } from "@/entities/order/model/order-no";
import { OrderNoTakenError, type PaymentStore } from "@/entities/payment/api/payment-store";
import { computeCharge } from "@/entities/payment/model/charge";
import type { Viewer } from "@/entities/session/model/viewer";
import { parseRegisterInput, type RegisterFormValues } from "./register-input";

// 선물 등록 = 주문 + 상자 + 결제 대기를 한 번에 만든다. 결제가 끝나야 크리에이터에게 승인 요청이 간다(INV-M6).

export type RegisterGiftResult =
  | { ok: true; orderId: string; orderNo: string; amountKrw: number }
  | { ok: false; status: 401 | 403; message: string }
  | { ok: false; status: 400; errors: Partial<Record<keyof RegisterFormValues, string>> };

/** 토스 orderId 규칙: 영문·숫자·-·_ 6~64자. */
function newPaymentOrderId(): string {
  return `pay_${crypto.randomUUID().replaceAll("-", "")}`;
}

/**
 * INV-L3: 주문의 팬은 viewer(서버가 확인한 로그인 사용자)다. 본문의 사용자 ID·닉네임 칸은 읽지 않는다 —
 * parseRegisterInput 이 정해진 다섯 칸만 꺼낸다.
 * INV-M1: 금액은 상자 구간과 서버 요금표로만 계산한다. 본문의 금액 칸은 읽지 않는다.
 */
export async function registerGift(
  deps: { store: PaymentStore; viewer: Viewer | null; newOrderNo?: () => string },
  body: unknown,
): Promise<RegisterGiftResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "fan") return { ok: false, status: 403, message: "팬 계정으로 로그인해야 선물을 보낼 수 있어요." };

  const parsed = parseRegisterInput(body);
  if (!parsed.success) return { ok: false, status: 400, errors: parsed.errors };

  const { creatorId, itemKind, boxes, hasElectronicsOrMetal } = parsed.data;
  const charge = computeCharge({ boxes });
  const registration = { fanId: deps.viewer.userId, creatorId, itemKind, hasElectronicsOrMetal, boxes };
  // 주문번호가 겹치면(다섯 자리 무작위) 새 번호로 두 번까지 다시 시도한다
  for (let attempt = 1; ; attempt += 1) {
    try {
      const stored = await deps.store.create({ orderId: newPaymentOrderId(), orderNo: (deps.newOrderNo ?? newOrderNo)(), charge, registration });
      // 결제 기록의 칸 나눔(택배 원가·서비스료)은 돌려주지 않는다 — 팬에게는 한 금액만(INV-M7)
      return { ok: true, orderId: stored.orderId, orderNo: stored.orderNo, amountKrw: stored.amountKrw };
    } catch (e) {
      if (!(e instanceof OrderNoTakenError) || attempt >= 3) throw e;
    }
  }
}
