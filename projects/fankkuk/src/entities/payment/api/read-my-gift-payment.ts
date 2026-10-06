import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGiftPayment, type GiftPayment } from "../model/gift-payment";

// 내 선물의 결제 금액 — 로그인한 사람의 토큰으로 읽는다(payment INV-M14). 남의 주문·결제 전 주문이면 null.
export async function readMyGiftPayment(client: Pick<SupabaseClient, "rpc">, orderNo: string): Promise<GiftPayment | null> {
  const { data, error } = await client.rpc("my_gift_payment", { p_order_no: orderNo });
  if (error) throw new Error(`결제 금액을 읽지 못했다: ${error.code}`);
  return parseGiftPayment(data);
}
