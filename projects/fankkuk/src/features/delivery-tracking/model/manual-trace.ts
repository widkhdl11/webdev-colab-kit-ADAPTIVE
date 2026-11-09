import { z } from "zod";
import { DeliveryApiError, TRACE_MAX_ITEMS, type DeliveryApi } from "@/shared/api/delivery-api/client";
import { normalizeTraceResponse, type NormalizedTrackingItem } from "@/shared/api/delivery-api/normalize";
import type { JsonReply } from "@/shared/lib/http/private-json";
import type { IngestCounts } from "./receive-webhook";

// 운영자 수동 조회 (delivery-status INV-DS14). 몸통 { ids: [조회 줄 ID…] } — 50개까지.
// 운영자 판정과 송장번호는 DB(admin_delivery_trace_targets)가 로그인 토큰으로 준다 — 운영자가 아니면 404.
// 받은 결과는 웹훅과 같은 수신 처리로 저장한다(INV-DS8~DS10). 응답에는 수만 — 송장번호·이력 없음.

export type TraceTarget = { trackingId: string; courierCode: string; waybillNo: string };

export type TraceDeps = {
  api: DeliveryApi | null;
  /** 운영자가 아니면 "forbidden" */
  targets: (ids: string[]) => Promise<TraceTarget[] | "forbidden">;
  ingest: (items: NormalizedTrackingItem[]) => Promise<IngestCounts>;
};

const bodyShape = z.object({ ids: z.array(z.string().uuid()).min(1).max(TRACE_MAX_ITEMS) }).strict();

export async function runManualTrace(deps: TraceDeps, body: unknown): Promise<JsonReply> {
  const parsed = bodyShape.safeParse(body);
  if (!parsed.success) return { status: 400, body: { message: "요청 형식이 맞지 않습니다." } };
  const targets = await deps.targets([...new Set(parsed.data.ids)]);
  if (targets === "forbidden") return { status: 404, body: { message: "요청한 항목을 찾을 수 없습니다." } };
  if (!deps.api) return { status: 503, body: { message: "배송 조회 서비스 키가 설정되지 않았습니다." } };
  if (targets.length === 0) return { status: 200, body: { saved: 0, ignored: 0, failed: 0 } };
  let response: unknown;
  try {
    response = await deps.api.trace(targets.map((t) => ({ courierCode: t.courierCode, trackingNumber: t.waybillNo, clientId: t.trackingId })));
  } catch (e) {
    const code = e instanceof DeliveryApiError ? e.code : "unknown";
    return { status: 502, body: { message: "배송 조회 서비스가 응답하지 않았습니다.", code } };
  }
  const normalized = normalizeTraceResponse(response);
  if (!normalized) return { status: 502, body: { message: "배송 조회 서비스 응답 형식이 맞지 않습니다." } };
  const counts = normalized.items.length > 0 ? await deps.ingest(normalized.items) : { saved: 0, ignored: 0 };
  return { status: 200, body: { saved: counts.saved, ignored: counts.ignored, failed: normalized.failed } };
}
