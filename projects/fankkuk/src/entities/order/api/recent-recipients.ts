import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 로그인한 사람이 선물을 보낸 크리에이터 id, 마지막으로 보낸 순(my_recent_recipients — 사람 ID 인자 없이 로그인 토큰의 계정만).
// 선물 보내기 목록의 순서에만 쓴다. 응답은 신뢰 경계 밖이라 형식을 검사한다.
const rowSchema = z.object({ creator_id: z.string().uuid() });

export async function readMyRecentRecipientIds(client: Pick<SupabaseClient, "rpc">): Promise<string[]> {
  const r = await client.rpc("my_recent_recipients");
  if (r.error) throw new Error(`최근에 선물한 크리에이터를 읽지 못했다: ${r.error.code}`);
  return z.array(rowSchema).parse(r.data).map((x) => x.creator_id);
}
