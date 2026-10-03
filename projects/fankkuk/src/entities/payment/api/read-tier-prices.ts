import type { SupabaseClient } from "@supabase/supabase-js";
import { priceTableFromRows, type PriceTable } from "../model/price-table";

// 지금 요금표 읽기 (admin-console INV-K3·K6). 화면 표시와 등록 계산이 요청마다 이 함수로 DB 요금표를 읽는다.
// 공개 읽기 함수라 어느 클라이언트(익명·로그인·관리자 키)로 불러도 된다. 표를 못 읽으면 금액을 지어내지 않고 실패한다.

export async function readTierPrices(supabase: SupabaseClient): Promise<PriceTable> {
  const { data, error } = await supabase.rpc("current_tier_prices");
  if (error) throw new Error(`요금표를 읽지 못했다: ${error.code}`);
  const table = priceTableFromRows(data);
  if (!table) throw new Error("요금표의 모양이 다르거나 저장 조건을 어긴다");
  return table;
}
