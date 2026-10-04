import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGiftBoxRows, parseShareBoxRows, type GiftBox, type ShareBox } from "../model/box-rows";

// 상자 송장번호 읽기 — 로그인한 사람의 토큰으로 DB 읽기 함수를 부른다. 누구 것인지는 DB 가 auth.uid() 로 정한다.
// 남의 주문번호를 넣으면 빈 목록이 온다.

export async function readMyGiftBoxes(client: Pick<SupabaseClient, "rpc">, orderNo: string): Promise<GiftBox[]> {
  const { data, error } = await client.rpc("my_gift_boxes", { p_order_no: orderNo });
  if (error) throw new Error(`선물 상자를 읽지 못했다: ${error.code}`);
  return parseGiftBoxRows(data);
}

export async function readMyShareBoxes(client: Pick<SupabaseClient, "rpc">): Promise<ShareBox[]> {
  const { data, error } = await client.rpc("my_share_boxes");
  if (error) throw new Error(`역조공 상자를 읽지 못했다: ${error.code}`);
  return parseShareBoxRows(data);
}
