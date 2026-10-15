import type { SupabaseClient } from "@supabase/supabase-js";
import { parseActionItems, type ActionItem } from "../model/action-items";

// 처리할 일 읽기(action-center INV-J2·J3) — 로그인한 사람의 토큰으로 DB 읽기 함수를 부른다. 계정 인자는 없다(누구 것인지는 DB 가 auth.uid() 로 정한다).
// 한 화면에서 한 번만 부르고 그 결과를 사이드바 숫자와 본문에 함께 넘긴다.
export async function readActionItems(client: Pick<SupabaseClient, "rpc">): Promise<ActionItem[]> {
  const { data, error } = await client.rpc("my_action_items");
  if (error) throw new Error(`처리할 일을 읽지 못했다: ${error.code}`);
  return parseActionItems(data);
}
