import type { SupabaseClient } from "@supabase/supabase-js";
import { priceTableFromRows, publicPriceTableFromRows, type PriceTable, type PublicPriceTable } from "../model/price-table";

// 지금 요금표 읽기 (admin-console INV-K3·K6). 요청마다 DB 요금표를 읽는다. 표를 못 읽으면 금액을 지어내지 않고 실패한다.
// 두 갈래다 — 화면은 공개 표(받는 값·역조공 값·반송 택배비)만, 등록 계산은 택배 원가·검수비까지 든 전체 표를 앱 서버 키로 읽는다.

/** 화면용 공개 요금표. 공개 읽기 함수라 어느 클라이언트(익명·로그인)로 불러도 된다. */
export async function readPublicPrices(supabase: Pick<SupabaseClient, "rpc">): Promise<PublicPriceTable> {
  const { data, error } = await supabase.rpc("public_tier_prices");
  if (error) throw new Error(`요금표를 읽지 못했다: ${error.code}`);
  const table = publicPriceTableFromRows(data);
  if (!table) throw new Error("공개 요금표의 형식이 다르다");
  return table;
}

/** 등록 계산용 전체 요금표. DB 가 앱 서버 키(관리자 키)에만 열어 준다 — 화면 쪽 키로 부르면 권한 오류다. */
export async function readTierPrices(admin: Pick<SupabaseClient, "rpc">): Promise<PriceTable> {
  const { data, error } = await admin.rpc("current_tier_prices");
  if (error) throw new Error(`요금표를 읽지 못했다: ${error.code}`);
  const table = priceTableFromRows(data);
  if (!table) throw new Error("요금표의 모양이 다르거나 저장 조건을 어긴다");
  return table;
}
