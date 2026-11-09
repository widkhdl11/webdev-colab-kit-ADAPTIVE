import { DeliveryApiError, SUBSCRIBE_MAX_ITEMS, type DeliveryApi } from "@/shared/api/delivery-api/client";

// 구독 대기 줄 보내기 (delivery-status INV-DS12·DS13). 송장 저장과 따로 돈다 — 실패해도 송장·출고는 그대로이고, 줄은 다음 때 다시 간다.
// 키나 웹훅 주소 번호가 없으면 아무것도 보내지 않는다(대기 줄은 그대로 남는다 — 키를 넣으면 다음 회차부터 간다).
// 넘기는 것은 택배사 코드·송장번호·조회 줄의 무작위 ID 뿐이다.

export type PendingTracking = { id: string; courierCode: string; waybillNo: string };

export type SubscribeDeps = {
  api: DeliveryApi | null;
  endpointId: string | null;
  claim: (limit: number) => Promise<PendingTracking[]>;
  result: (ids: string[], error: string | null) => Promise<void>;
};

export type SubscribeOutcome = { kind: "skipped" } | { kind: "done"; subscribed: number; failed: number };

export async function runSubscribeSweep(deps: SubscribeDeps): Promise<SubscribeOutcome> {
  if (!deps.api || !deps.endpointId) return { kind: "skipped" };
  const rows = await deps.claim(SUBSCRIBE_MAX_ITEMS);
  if (rows.length === 0) return { kind: "done", subscribed: 0, failed: 0 };
  const ids = rows.map((r) => r.id);
  try {
    await deps.api.subscribe(
      rows.map((r) => ({ courierCode: r.courierCode, trackingNumber: r.waybillNo, clientId: r.id })),
      deps.endpointId,
    );
  } catch (e) {
    await deps.result(ids, e instanceof DeliveryApiError ? e.code : "unknown");
    return { kind: "done", subscribed: 0, failed: ids.length };
  }
  await deps.result(ids, null);
  return { kind: "done", subscribed: ids.length, failed: 0 };
}
