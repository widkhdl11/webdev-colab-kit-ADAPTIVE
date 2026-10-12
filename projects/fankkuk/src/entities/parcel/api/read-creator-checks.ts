import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCreatorCheckRows, type CreatorCheckView } from "../model/creator-check";

// 크리에이터에게 답을 기다리는 상자를 DB 읽기 함수(my_creator_checks)로 읽는다. 함수가 로그인한 크리에이터의 것만,
// 답이 없고 주문이 끝나지 않은 상자만 돌려준다(2026-10-12 (2) D3 ②).
export async function readMyCreatorChecks(client: Pick<SupabaseClient, "rpc">): Promise<CreatorCheckView[]> {
  const { data, error } = await client.rpc("my_creator_checks");
  if (error) throw new Error(`확인할 선물을 읽지 못했다: ${error.code}`);
  return parseCreatorCheckRows(data);
}
