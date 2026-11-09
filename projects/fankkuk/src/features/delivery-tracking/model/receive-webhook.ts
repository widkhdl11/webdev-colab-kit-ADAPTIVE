import { normalizeWebhookBody, type NormalizedTrackingItem } from "@/shared/api/delivery-api/normalize";
import { verifyWebhookSignature } from "@/shared/api/delivery-api/signature";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 배송 조회 웹훅 수신 (delivery-status INV-DS7~DS10).
// 순서: 서명(받은 본문 그대로) → 그 문자열을 해석 → 정리 → DB 수신 처리(모르는 송장 무시·단계 앞으로만·원본 따로).
// 서명이 틀리면 401, 내용은 비운다. 응답에는 수만 담고 송장·이력은 담지 않는다. 조회 서비스는 3초 안의 200 을 기다린다.

export type IngestCounts = { saved: number; ignored: number };

export type WebhookDeps = {
  webhookSecret: string | null;
  ingest: (items: NormalizedTrackingItem[]) => Promise<IngestCounts>;
};

export type WebhookRequest = { timestamp: string | null; signature: string | null; rawBody: string; nowMs: number };

export const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

/** DB 수신 처리로 넘길 꼴 — 원본(raw)은 원본 표에만 들어간다 */
export function toIngestPayload(items: readonly NormalizedTrackingItem[]) {
  return items.map((i) => ({ courier_code: i.courierCode, tracking_number: i.trackingNumber, status: i.status, progresses: i.progresses, raw: i.raw }));
}

export async function receiveDeliveryWebhook(deps: WebhookDeps, req: WebhookRequest): Promise<JsonReply> {
  if (Buffer.byteLength(req.rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) return { status: 413, body: {} };
  const verdict = verifyWebhookSignature({ secret: deps.webhookSecret, timestamp: req.timestamp, signature: req.signature, rawBody: req.rawBody, nowMs: req.nowMs });
  if (verdict !== "ok") return { status: 401, body: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(req.rawBody);
  } catch {
    return { status: 400, body: {} };
  }
  const items = normalizeWebhookBody(parsed);
  if (items === null) return { status: 400, body: {} };
  if (items.length === 0) return { status: 200, body: { saved: 0, ignored: 0 } };
  const counts = await deps.ingest(items);
  return { status: 200, body: { saved: counts.saved, ignored: counts.ignored } };
}
