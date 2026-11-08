import type { SupabaseClient } from "@supabase/supabase-js";
import { boxServiceFeesFromRow, type BoxServiceFees } from "../model/box-service-fees";
import { carrierPricingFromRow, type CarrierPricing } from "../model/carrier-pricing";
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

/** 경로표·기본 경로·팬에게 보내기 택배비 (admin-console INV-K15). 운영자가 아니면 DB 가 null 을 준다 — 운영자 화면에서는 실패로 본다. */
export async function readAdminCarrierPricing(client: Pick<SupabaseClient, "rpc">): Promise<CarrierPricing> {
  const { data, error } = await client.rpc("admin_carrier_pricing");
  if (error) throw new Error(`경로표를 읽지 못했다: ${error.code}`);
  const pricing = carrierPricingFromRow(data);
  if (!pricing) throw new Error("경로표가 비었거나 형식이 다르다");
  return pricing;
}

/** 선물함 서비스료 정가·초기 크리에이터 값 (revgift-box INV-GB14·GB15). 운영자가 아니면 DB 가 거부한다 — 운영자 화면에서는 실패로 본다. */
export async function readAdminBoxServiceFees(client: Pick<SupabaseClient, "rpc">): Promise<BoxServiceFees> {
  const { data, error } = await client.rpc("admin_box_service_fees");
  if (error) throw new Error(`선물함 서비스료를 읽지 못했다: ${error.code}`);
  const fees = boxServiceFeesFromRow(data);
  if (!fees) throw new Error("선물함 서비스료의 형식이 다르다");
  return fees;
}
