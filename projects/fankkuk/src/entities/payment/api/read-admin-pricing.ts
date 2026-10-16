import type { SupabaseClient } from "@supabase/supabase-js";
import { priceChangesFromRows, type PriceChange } from "../model/price-change";
import { priceTableFromRows, type PriceTable } from "../model/price-table";

// 관리자 요금표 화면의 읽기 (admin-console INV-K1·K5·K8). 로그인한 운영자의 세션 클라이언트로 부른다 —
// 운영자가 아니면 DB 가 빈 결과를 준다. 운영자 화면에서 빈 표는 이상한 상태라 지어내지 않고 실패한다.

export async function readAdminPriceTable(client: Pick<SupabaseClient, "rpc">): Promise<PriceTable> {
  const { data, error } = await client.rpc("admin_tier_prices");
  if (error) throw new Error(`요금표를 읽지 못했다: ${error.code}`);
  const table = priceTableFromRows(data);
  if (!table) throw new Error("요금표가 비었거나 형식이 다르다");
  return table;
}

export async function readAdminPriceChanges(client: Pick<SupabaseClient, "rpc">): Promise<PriceChange[]> {
  const { data, error } = await client.rpc("admin_price_changes");
  if (error) throw new Error(`요금 변경 기록을 읽지 못했다: ${error.code}`);
  const changes = priceChangesFromRows(data);
  if (!changes) throw new Error("요금 변경 기록의 형식이 다르다");
  return changes;
}
