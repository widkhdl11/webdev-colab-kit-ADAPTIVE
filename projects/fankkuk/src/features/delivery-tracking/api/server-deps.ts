import "server-only";
import { createDeliveryApi, type DeliveryApi } from "@/shared/api/delivery-api/client";
import { readDeliveryApiCredentials, readDeliveryApiEndpointId } from "@/shared/api/delivery-api/config";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { runSubscribeSweep, type SubscribeOutcome } from "../model/subscribe-sweep";
import { claimPendingTrackings, saveSubscribeResult } from "./delivery-db";

// 서버 조립 — 키가 없으면 연결은 null(조용히 꺼짐, delivery-status INV-DS12). 기동을 막지 않는다.

export function deliveryApiFromEnv(): DeliveryApi | null {
  const cred = readDeliveryApiCredentials(process.env);
  return cred ? createDeliveryApi(cred) : null;
}

/** 구독 대기 줄을 한 번 보낸다. 어떤 실패도 던지지 않는다 — 부르는 쪽(출고 처리 뒤·예약 작업)을 막지 않게 */
export async function subscribePendingQuietly(): Promise<SubscribeOutcome | null> {
  try {
    const api = deliveryApiFromEnv();
    const endpointId = readDeliveryApiEndpointId(process.env);
    if (!api || !endpointId) return { kind: "skipped" };
    const admin = createAdminSupabase();
    return await runSubscribeSweep({
      api,
      endpointId,
      claim: (limit) => claimPendingTrackings(admin, limit),
      result: (ids, error) => saveSubscribeResult(admin, ids, error),
    });
  } catch (e) {
    console.error("delivery: 구독 대기 줄 보내기 실패", e instanceof Error ? e.name : typeof e);
    return null;
  }
}
