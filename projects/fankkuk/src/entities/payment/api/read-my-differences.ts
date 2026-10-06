import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDifferenceRows, type GiftDifference } from "../model/difference-rows";

// 내 주문의 차액 요청 — 로그인한 사람의 토큰으로 읽는다. 남의 주문번호면 빈 목록(DB 가 auth.uid() 로 거른다).
export async function readMyDifferences(client: Pick<SupabaseClient, "rpc">, orderNo: string): Promise<GiftDifference[]> {
  const { data, error } = await client.rpc("my_difference_payments", { p_order_no: orderNo });
  if (error) throw new Error(`차액 요청을 읽지 못했다: ${error.code}`);
  return parseDifferenceRows(data);
}
