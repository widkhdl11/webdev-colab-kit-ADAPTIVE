import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * 로그인한 크리에이터가 이 크리에이터에게 지금 보낼 수 있는가(INV-L8·INV-L9) — 화면 표시용 한 명씩 묻기.
 * 목록으로 묻지 않는다: 「나를 팔로우하는 크리에이터」 명단이 한 번에 드러나기 때문이다. 판정은 등록 때 서버·DB 가 다시 한다.
 */
export async function canSendGiftTo(client: Pick<SupabaseClient, "rpc">, creatorId: string): Promise<boolean> {
  const r = await client.rpc("can_send_gift_to", { p_creator_id: creatorId });
  if (r.error) throw new Error(`보낼 수 있는지 확인하지 못했다: ${r.error.code}`);
  return z.boolean().parse(r.data);
}
