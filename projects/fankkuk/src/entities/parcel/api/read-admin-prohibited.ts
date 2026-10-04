import type { SupabaseClient } from "@supabase/supabase-js";
import { adminProhibitedItemsFromRows, prohibitedChangesFromRows, type AdminProhibitedItem, type ProhibitedChange } from "../model/admin-prohibited";

// 관리자 「보낼 수 없는 물품」 화면의 읽기 (admin-console INV-K9·K8). 로그인한 운영자의 세션 클라이언트로 부른다 —
// 운영자가 아니면 DB 가 빈 결과를 준다. 꼴이 다른 응답은 지어내지 않고 실패한다.

export async function readAdminProhibitedItems(client: Pick<SupabaseClient, "rpc">): Promise<AdminProhibitedItem[]> {
  const { data, error } = await client.rpc("admin_prohibited_items");
  if (error) throw new Error(`금지 물품 목록을 읽지 못했다: ${error.code}`);
  const items = adminProhibitedItemsFromRows(data);
  if (!items) throw new Error("금지 물품 목록의 모양이 다르다");
  return items;
}

export async function readAdminProhibitedChanges(client: Pick<SupabaseClient, "rpc">): Promise<ProhibitedChange[]> {
  const { data, error } = await client.rpc("admin_prohibited_changes");
  if (error) throw new Error(`금지 물품 변경 기록을 읽지 못했다: ${error.code}`);
  const changes = prohibitedChangesFromRows(data);
  if (!changes) throw new Error("금지 물품 변경 기록의 모양이 다르다");
  return changes;
}
