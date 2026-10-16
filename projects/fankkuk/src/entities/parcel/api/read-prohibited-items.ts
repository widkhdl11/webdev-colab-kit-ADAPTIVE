import type { SupabaseClient } from "@supabase/supabase-js";
import { prohibitedItemsFromRows, type ProhibitedItem } from "../model/prohibited-item";

// 보낼 수 없는 물품 공개 읽기 (admin-console INV-K9). 공개 읽기 함수라 어느 클라이언트(익명·로그인)로 불러도 된다.
// 못 읽으면 빈 목록으로 지어내지 않고 실패한다 — 빈 목록은 「무엇이든 보낼 수 있다」로 읽힌다.

export async function readProhibitedItems(supabase: Pick<SupabaseClient, "rpc">): Promise<ProhibitedItem[]> {
  const { data, error } = await supabase.rpc("list_prohibited_items");
  if (error) throw new Error(`보낼 수 없는 물품 목록을 읽지 못했다: ${error.code}`);
  const items = prohibitedItemsFromRows(data);
  if (!items) throw new Error("보낼 수 없는 물품 목록의 형식이 다르다");
  return items;
}
