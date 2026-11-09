import type { SupabaseClient } from "@supabase/supabase-js";
import { DELIVERY_STATUS_SOURCES, type DeliveryStatusSource } from "@/shared/config/delivery-status";

// 단계 설정값 읽기 (delivery-status INV-DS11). DB 의 설정값 하나를 화면 서버가 읽어 단계 계산에 넘긴다 — 앱에는 기본값이 없다.
// 읽지 못하면 던진다 — 모르는 값을 estimate 로 짐작하면 DB 쪽(주소 삭제·탈퇴)과 화면이 갈라진다.

export async function readDeliveryStatusSource(client: Pick<SupabaseClient, "rpc">): Promise<DeliveryStatusSource> {
  const { data, error } = await client.rpc("delivery_status_source");
  if (error) throw new Error(`배송 단계 설정값을 읽지 못했다: ${error.code}`);
  const found = DELIVERY_STATUS_SOURCES.find((s) => s === data);
  if (!found) throw new Error("배송 단계 설정값이 목록에 없다");
  return found;
}
