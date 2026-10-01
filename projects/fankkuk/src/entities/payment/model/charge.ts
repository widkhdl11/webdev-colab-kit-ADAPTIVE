import { z } from "zod";

/** INV-M1: 검수·전달 서비스료. 검수 없는 요금은 없다(단일 요금). */
export const SERVICE_FEE_KRW = 5000;

const krw = z.number().int().nonnegative();

const breakdownSchema = z
  .object({ goodsKrw: krw, serviceFeeKrw: krw, shippingFeeKrw: krw, totalKrw: krw })
  .strict()
  // INV-M7: 세 칸의 합이 결제 금액과 같아야 한다.
  .refine((b) => b.goodsKrw + b.serviceFeeKrw + b.shippingFeeKrw === b.totalKrw);

export type ChargeBreakdown = z.infer<typeof breakdownSchema>;

/**
 * INV-M1: 결제 금액은 서버 설정값으로만 계산한다. 인자에 다른 칸이 섞여 와도 쓰지 않는다.
 * 상품 대금은 대신 구매가 없는 지금 0 이다(INV-M7 칸 분리는 유지).
 */
export function computeCharge(config: { shippingFeeKrw: number }): ChargeBreakdown {
  const shippingFeeKrw = krw.parse(config.shippingFeeKrw);
  return {
    goodsKrw: 0,
    serviceFeeKrw: SERVICE_FEE_KRW,
    shippingFeeKrw,
    totalKrw: SERVICE_FEE_KRW + shippingFeeKrw,
  };
}

/** 저장된 결제 기록을 읽을 때의 경계. 합이 안 맞으면 null(INV-M7). */
export function parseChargeBreakdown(input: unknown): ChargeBreakdown | null {
  const parsed = breakdownSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
