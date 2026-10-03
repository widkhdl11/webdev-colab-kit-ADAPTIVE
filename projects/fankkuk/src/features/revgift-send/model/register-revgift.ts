import { z } from "zod";
import { isBillableTier, type BillableTier } from "@/entities/payment/config/tier-pricing";
import { computeRevgiftCharge, revgiftTierBreakdown, type ChargeBreakdown } from "@/entities/payment/model/charge";
import { newRevgiftOrderNo } from "@/entities/revgift/model/revgift-order-no";
import type { Viewer } from "@/entities/session/model/viewer";

// 역조공 보내기 등록 = 보내기 + 몫들 + 결제 대기를 한 번에 만든다(reverse-gift INV-R1·R3).
// 받는 팬이 나를 팔로우하는지는 DB 등록 함수가 팔로우 표를 직접 읽어 판정한다(INV-R1). 앱 서버는 역할·꼴·금액을 맡는다.

export const MAX_REVGIFT_SHARES = 10;

export type RevgiftShareDraft = { fanId: string; tier: BillableTier; orderNo: string; amountKrw: number; shippingFeeKrw: number };

export type RevgiftCreateInput = { senderId: string; tossOrderId: string; charge: ChargeBreakdown; shares: RevgiftShareDraft[] };

/** DB 가 받는 사람을 거부했다(나를 팔로우하는 팬 계정이 아님) — INV-R1 의 두 번째 장치. */
export type RevgiftRefusal = "not_follower" | "order_no_taken";

export interface RevgiftStore {
  /** 거부되면 refusal 칸이 붙은 오류를 던진다. */
  create(input: RevgiftCreateInput): Promise<{ sendId: string }>;
}

export type RegisterRevgiftResult =
  | { ok: true; sendId: string; tossOrderId: string; orderNos: string[]; amountKrw: number }
  | { ok: false; status: 400 | 401 | 403; message: string };

const NOT_FOLLOWER_MESSAGE = "나를 팔로우한 팬에게만 보낼 수 있어요.";

const inputSchema = z.object({
  shares: z
    .array(z.object({ fanId: z.string().uuid(), tier: z.string().refine(isBillableTier) }))
    .min(1)
    .max(MAX_REVGIFT_SHARES)
    // INV-R3: 한 보내기 안에 같은 팬은 한 번
    .refine((rows) => new Set(rows.map((r) => r.fanId)).size === rows.length),
});

function newPaymentOrderId(): string {
  return `rgpay_${crypto.randomUUID().replaceAll("-", "")}`;
}

function refusalOf(e: unknown): RevgiftRefusal | null {
  const r = (e as { refusal?: unknown } | null)?.refusal;
  return r === "not_follower" || r === "order_no_taken" ? r : null;
}

/**
 * 보내는 사람은 viewer(서버가 확인한 로그인 크리에이터)다. 본문의 보내는 사람·금액 칸은 읽지 않는다 —
 * 금액은 몫마다 고른 상자 구간의 역조공 요금으로만 계산한다(INV-R3).
 */
export async function registerRevgift(
  deps: { store: RevgiftStore; viewer: Viewer | null; newOrderNo?: () => string },
  body: unknown,
): Promise<RegisterRevgiftResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: "역조공은 크리에이터만 보낼 수 있어요." };

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "받을 팬과 상자를 다시 확인해 주세요. 한 번에 10명까지, 같은 팬은 한 번만 넣을 수 있어요." };

  const tiers = parsed.data.shares.map((s) => s.tier as BillableTier);
  const charge = computeRevgiftCharge({ boxes: tiers });
  const makeNo = deps.newOrderNo ?? newRevgiftOrderNo;

  // 주문번호가 겹치면(여섯 자리 무작위) 새 번호로 두 번까지 다시 시도한다
  for (let attempt = 1; ; attempt += 1) {
    const shares: RevgiftShareDraft[] = parsed.data.shares.map((s) => {
      const b = revgiftTierBreakdown(s.tier as BillableTier);
      return { fanId: s.fanId, tier: s.tier as BillableTier, orderNo: makeNo(), amountKrw: b.totalKrw, shippingFeeKrw: b.shippingFeeKrw };
    });
    const tossOrderId = newPaymentOrderId();
    try {
      const { sendId } = await deps.store.create({ senderId: deps.viewer.userId, tossOrderId, charge, shares });
      return { ok: true, sendId, tossOrderId, orderNos: shares.map((s) => s.orderNo), amountKrw: charge.totalKrw };
    } catch (e) {
      const refusal = refusalOf(e);
      if (refusal === "not_follower") return { ok: false, status: 403, message: NOT_FOLLOWER_MESSAGE };
      if (refusal !== "order_no_taken" || attempt >= 3) throw e;
    }
  }
}
