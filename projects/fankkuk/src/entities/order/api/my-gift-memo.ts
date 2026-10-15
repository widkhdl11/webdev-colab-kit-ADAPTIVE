import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { GiftMemo } from "../model/gift-memo";

// 선물 상세의 「나만 보는 메모」(together INV-F7·F8) — 로그인한 사람의 토큰으로 my_gift_memo 를 부른다.
// 함수는 계정 ID 인자 없이 로그인한 계정이 보낸 주문일 때만 메모를 주고, 남의 주문·메모 없는 주문이면 null 을 준다.
// 응답은 신뢰 경계 밖이라 여기서 형식을 검사한다.

const memoSchema = z.object({ title: z.string().nullable(), body: z.string().nullable() }).nullable();

export function parseGiftMemo(data: unknown): GiftMemo | null {
  return memoSchema.parse(data);
}

export async function readMyGiftMemo(client: Pick<SupabaseClient, "rpc">, orderNo: string): Promise<GiftMemo | null> {
  const { data, error } = await client.rpc("my_gift_memo", { p_order_no: orderNo });
  if (error) throw new Error(`선물 메모를 읽지 못했다: ${error.code}`);
  return parseGiftMemo(data);
}
