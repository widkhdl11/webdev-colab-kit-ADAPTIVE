import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SentBoxCandidate } from "../ui/find-sent-box";

// 미확인 상자 창의 팬 고르기 후보(action-center INV-J7, inbound-address-code INV-C4 ②-나). DB 읽기 함수가 로그인한 크리에이터가 보낸
// 결제 끝·입고 전·닫히지 않은 몫만, 몫 번호·받는 팬 닉네임·상자 크기 세 칸만 준다. 꼴이 다르면 던진다(모르는 칸을 화면에 내지 않는다).
const rows = z.array(z.object({ share_id: z.string().uuid(), fan_nickname: z.string(), tier: z.string() }).strict());

export async function readSentBoxCandidates(client: Pick<SupabaseClient, "rpc">): Promise<SentBoxCandidate[]> {
  const { data, error } = await client.rpc("my_revgift_find_candidates");
  if (error) throw new Error(`내 상자 찾기 후보를 읽지 못했다: ${error.code}`);
  return rows.parse(data ?? []).map((r) => ({ shareId: r.share_id, nickname: r.fan_nickname, tier: r.tier }));
}
