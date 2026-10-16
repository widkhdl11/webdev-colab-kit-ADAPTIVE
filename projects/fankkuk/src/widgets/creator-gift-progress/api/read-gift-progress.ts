import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGiftProgressRows, type GiftProgress } from "../model/gift-progress";

// 크리에이터 선물 현황 읽기(action-center INV-J9·J10). DB 읽기 함수가 인자 없이 로그인 토큰의 크리에이터 것만, 정해진 칸만 돌려준다.
// 응답은 여기서 형식을 검사한다 — 정해지지 않은 칸이 섞여 오면 받지 않는다.

export async function readMyGiftProgress(client: Pick<SupabaseClient, "rpc">): Promise<GiftProgress> {
  const { data, error } = await client.rpc("my_gift_progress");
  if (error) throw new Error(`선물 현황을 읽지 못했다: ${error.code}`);
  return parseGiftProgressRows(data);
}
