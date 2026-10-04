import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 크리에이터가 차단한 사람 목록(DB 읽기 함수 my_blocked_senders — decline-block INV-D9).
// 함수가 로그인한 크리에이터의 줄만, 차단 줄 식별값·지금 닉네임·차단한 때만 돌려준다. 아이디·계정 값·연락처는 오지 않는다.

/** blockId 는 차단 줄의 식별값이다 — 풀 때 이것 하나만 서버로 보낸다(INV-D10). 보낸 사람 계정 값이 아니다. */
export type BlockedFan = { blockId: string; fanNickname: string; blockedAt: string };

const rowSchema = z.object({
  block_id: z.string().uuid(),
  nickname: z.string(),
  blocked_at: z.string().min(1),
});

export function parseBlockedSenderRows(rows: unknown): BlockedFan[] {
  return z
    .array(rowSchema)
    .parse(rows)
    .map((r) => ({ blockId: r.block_id, fanNickname: r.nickname, blockedAt: new Date(r.blocked_at).toISOString() }));
}

export async function readMyBlockedSenders(client: Pick<SupabaseClient, "rpc">): Promise<BlockedFan[]> {
  const { data, error } = await client.rpc("my_blocked_senders");
  if (error) throw new Error(`차단 목록을 읽지 못했다: ${error.code}`);
  return parseBlockedSenderRows(data);
}
