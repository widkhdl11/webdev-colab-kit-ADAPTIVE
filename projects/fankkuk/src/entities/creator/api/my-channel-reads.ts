import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 본인이 채널을 만들었는지(signup INV-U21) — 채널 없음 = 닉네임이 비어 있는 크리에이터. 본인 계정 칸(my_profile)의 닉네임으로 본다.
// 꼴이 틀리거나 읽지 못하면 던진다 — 「채널 만들기」 줄을 지어내지도 빼지도 않게(action-center INV-J6).

const profileRows = z.array(z.object({ nickname: z.string().nullable() })).min(1);

/** my_profile 응답 → 채널을 만들었는지 */
export function parseMyChannelMade(data: unknown): boolean {
  return profileRows.parse(data)[0]!.nickname !== null;
}

export async function readMyChannelMadeOrThrow(client: Pick<SupabaseClient, "rpc">): Promise<boolean> {
  const { data, error } = await client.rpc("my_profile");
  if (error) throw new Error(`my_profile 읽기 실패: ${error.code}`);
  return parseMyChannelMade(data);
}
