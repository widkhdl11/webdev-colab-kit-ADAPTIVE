import { z } from "zod";
import type { DeliveryApiCredentials } from "./config";

// 배송 조회 서비스(택배API) 호출 — 서버 전용. 구독(웹훅 등록)과 수동 조회 둘만.
// 넘기는 것은 택배사 코드·송장번호·부르는 쪽의 내부 번호(clientId)뿐이다 — 주소·이름·전화는 이 꼴에 칸이 없다(delivery-status INV-DS13).
// 키·시크릿·응답의 오류 문장은 예외 메시지·로그에 넣지 않는다 — 실패는 정해진 코드로만 던진다.
// 근거: https://www.deliveryapi.co.kr/docs (2026-11-09 읽음)
// - POST /v1/webhooks/register { items[≤100]: { courierCode, trackingNumber, clientId? }, recurring, endpointId? } → { isSuccess, data: { requestId, itemCount } }
// - POST /v1/tracking/trace { items[≤50], includeProgresses } → { isSuccess, data: { results, summary } }
// - 오류: { isSuccess: false, statusCode, errorCode, error }

export const DELIVERY_API_BASE = "https://api.deliveryapi.co.kr";
export const SUBSCRIBE_MAX_ITEMS = 100;
export const TRACE_MAX_ITEMS = 50;
const TIMEOUT_MS = 10_000;

export type TrackingTarget = { courierCode: string; trackingNumber: string; clientId: string };

export class DeliveryApiError extends Error {
  constructor(readonly code: string) {
    super(`배송 조회 서비스 호출 실패: ${code}`);
    this.name = "DeliveryApiError";
  }
}

export type DeliveryApi = {
  /** 14일 동안 1시간마다 조회해 웹훅으로 받는 구독 */
  subscribe(items: readonly TrackingTarget[], endpointId: string): Promise<void>;
  /** 지금 상태를 한 번 조회 — 응답 본문을 그대로 돌려준다(정리는 normalizeTraceResponse) */
  trace(items: readonly TrackingTarget[]): Promise<unknown>;
};

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const errorShape = z.object({ errorCode: z.string().regex(/^[A-Za-z0-9_]{1,60}$/) }).passthrough();

function bodyOf(items: readonly TrackingTarget[]) {
  return items.map((i) => ({ courierCode: i.courierCode, trackingNumber: i.trackingNumber, clientId: i.clientId }));
}

export function createDeliveryApi(cred: DeliveryApiCredentials, fetchImpl: FetchLike = fetch as unknown as FetchLike): DeliveryApi {
  async function post(path: string, payload: unknown): Promise<unknown> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await fetchImpl(`${DELIVERY_API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred.apiKey}:${cred.apiSecret}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new DeliveryApiError("network");
    }
    const json: unknown = await res.json().catch(() => null);
    const ok = res.ok && typeof json === "object" && json !== null && (json as { isSuccess?: unknown }).isSuccess === true;
    if (!ok) {
      const e = errorShape.safeParse(json);
      throw new DeliveryApiError(e.success ? e.data.errorCode : `http_${res.status}`);
    }
    return json;
  }

  return {
    async subscribe(items, endpointId) {
      if (items.length === 0) return;
      if (items.length > SUBSCRIBE_MAX_ITEMS) throw new DeliveryApiError("too_many_items");
      await post("/v1/webhooks/register", { items: bodyOf(items), recurring: true, endpointId });
    },
    async trace(items) {
      if (items.length > TRACE_MAX_ITEMS) throw new DeliveryApiError("too_many_items");
      return post("/v1/tracking/trace", { items: bodyOf(items), includeProgresses: true });
    },
  };
}
