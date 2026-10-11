import { newOrderNo } from "@/entities/order/model/order-no";
import { OrderNoTakenError, PriceChangedError, SenderRefusedError, type PaymentStore } from "@/entities/payment/api/payment-store";
import { computeCharge } from "@/entities/payment/model/charge";
import { z } from "zod";
import { PRICE_CHANGED_MESSAGE, quotedTotalSchema, type PriceTable } from "@/entities/payment/model/price-table";
import type { Viewer } from "@/entities/session/model/viewer";
import { kstToday, limitReachedMessage } from "@/entities/creator/model/receiving";
import type { CreatorRelationReader } from "../api/creator-relation";
import { parseRegisterInput, type RegisterFormValues } from "./register-input";
import { decideSender, refusalStatus, SENDER_REFUSAL_MESSAGE, senderRoleAllowed } from "./sender-rule";

// 선물 등록 = 주문 + 상자 + 결제 대기를 한 번에 만든다. 결제가 끝나야 크리에이터에게 승인 요청이 간다(INV-M6).

export type RegisterGiftResult =
  | { ok: true; orderId: string; orderNo: string; amountKrw: number }
  | { ok: false; status: 401 | 403 | 404 | 409; message: string; reason?: "hard_item" }
  | { ok: false; status: 400; errors: Partial<Record<keyof RegisterFormValues, string>> };

const quotedShape = z.object({ quotedTotalKrw: quotedTotalSchema });

/** 토스 orderId 규칙: 영문·숫자·-·_ 6~64자. */
function newPaymentOrderId(): string {
  return `pay_${crypto.randomUUID().replaceAll("-", "")}`;
}

/**
 * INV-L3: 주문의 보내는 사람(fanId 칸)은 viewer(서버가 확인한 로그인 사용자)다. 본문의 사용자 ID·닉네임 칸은 읽지 않는다 —
 * parseRegisterInput 이 정해진 다섯 칸만 꺼낸다.
 * INV-M1: 금액은 상자 구간과 서버 요금표로만 계산한다. 본문의 금액 칸은 읽지 않는다.
 * INV-K3: 요금표는 요청마다 한 번 DB 에서 읽는다(readPrices). 본문의 quotedTotalKrw(화면이 보여 준 합계)가 그 표로 계산한
 * 합계와 다르면 화면을 연 뒤 요금이 바뀐 것이다 — DB 를 부르기 전에 409 로 끝낸다. 이 값은 비교에만 쓰고 결제 금액으로 쓰지 않는다.
 * 읽은 뒤 등록하기 전에 바뀌면 DB 등록 함수가 거부하고(P0031) 역시 409 로 끝낸다.
 */
export async function registerGift(
  deps: {
    store: PaymentStore;
    viewer: Viewer | null;
    creatorRelation: CreatorRelationReader;
    readPrices: () => Promise<PriceTable>;
    newOrderNo?: () => string;
    /** 한도 문구의 「다음 달 1일」을 정할 지금 시각(시험이 고정한다) */
    now?: () => Date;
  },
  body: unknown,
): Promise<RegisterGiftResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  // INV-L3: 운영자는 본문을 읽기 전에 거부한다
  if (!senderRoleAllowed(deps.viewer.role)) return { ok: false, status: 403, message: SENDER_REFUSAL_MESSAGE.role };

  const parsed = parseRegisterInput(body);
  if (!parsed.success) return { ok: false, status: 400, errors: parsed.errors };
  const quoted = quotedShape.safeParse(body);
  if (!quoted.success) return { ok: false, status: 400, errors: {} };

  const { creatorId, itemCategory, itemOther, boxes, hasElectronicsOrMetal, anniversaryName } = parsed.data;
  // INV-L8·INV-L9: 받는 크리에이터와의 관계(자기 자신인가·팔로우했는가)를 로그인한 사람 기준으로 서버가 읽어 판정한다
  // (DB 등록 함수도 따로 막는다)
  const relation = await deps.creatorRelation(deps.viewer.userId, creatorId);
  const verdict = decideSender(deps.viewer.role, relation);
  if (!verdict.ok) return { ok: false, status: refusalStatus(verdict.reason), message: SENDER_REFUSAL_MESSAGE[verdict.reason] };

  const charge = computeCharge(await deps.readPrices(), { boxes });
  if (charge.totalKrw !== quoted.data.quotedTotalKrw) return { ok: false, status: 409, message: PRICE_CHANGED_MESSAGE };
  const registration = { fanId: deps.viewer.userId, creatorId, itemCategory, itemOther, hasElectronicsOrMetal, boxes, anniversaryName };
  // 주문번호가 겹치면(다섯 자리 무작위) 새 번호로 두 번까지 다시 시도한다
  for (let attempt = 1; ; attempt += 1) {
    try {
      const stored = await deps.store.create({ orderId: newPaymentOrderId(), orderNo: (deps.newOrderNo ?? newOrderNo)(), charge, registration });
      // 결제 기록의 칸 나눔(택배 원가·서비스료)은 돌려주지 않는다 — 팬에게는 한 금액만(INV-M7)
      return { ok: true, orderId: stored.orderId, orderNo: stored.orderNo, amountKrw: stored.amountKrw };
    } catch (e) {
      if (e instanceof PriceChangedError) return { ok: false, status: 409, message: PRICE_CHANGED_MESSAGE };
      if (e instanceof SenderRefusedError) {
        // 본인 확인 전·차단(unknown_creator)과 채널 이사 중(INV-V12)은 DB 가 처음 판정하는 정상 경로다. 나머지는 서버 판정이 빠졌다는 뜻이다
        // 쉬는 중·한도(creator-receiving INV-B2·B4)도 DB 만 판정하는 정상 경로다
        // 받기 어려운 품목 등록 막기(hard-items INV-H7)도 DB 만 판정한다
        const dbOnly =
          e.reason === "unknown_creator" || e.reason === "moving" || e.reason === "resting" || e.reason === "limit" || e.reason === "hard_item";
        if (!dbOnly) console.error(`선물 등록: 서버 판정을 지나 DB 가 거부했다 (${e.reason})`);
        // INV-B6: 한도 문구는 하나 — 다음 달 1일만 넣고 한도 숫자·남은 개수는 넣지 않는다
        const message = e.reason === "limit" ? limitReachedMessage(kstToday((deps.now ?? (() => new Date()))())) : SENDER_REFUSAL_MESSAGE[e.reason];
        // hard-items INV-H7: 화면이 이유를 알아야 2단계로 돌아가 안내를 다시 보인다(요금 변경 409 와 가르기)
        return { ok: false, status: refusalStatus(e.reason), message, ...(e.reason === "hard_item" ? { reason: "hard_item" as const } : {}) };
      }
      if (!(e instanceof OrderNoTakenError) || attempt >= 3) throw e;
    }
  }
}
