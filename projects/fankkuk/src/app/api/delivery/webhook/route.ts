import type { NextRequest } from "next/server";
import { ingestTrackingItems } from "@/features/delivery-tracking/api/delivery-db";
import { MAX_WEBHOOK_BODY_BYTES, receiveDeliveryWebhook } from "@/features/delivery-tracking/model/receive-webhook";
import { readDeliveryApiWebhookSecret } from "@/shared/api/delivery-api/config";
import { createAdminSupabase } from "@/shared/api/supabase/admin";

// 배송 조회 서비스(택배API) 웹훅 입구 (delivery-status INV-DS7~DS10). 로그인·같은 사이트 검사 대신 서명으로만 보낸 쪽을 믿는다.
// 본문은 문자열로 한 번 읽어 그 문자열로 서명을 본 뒤 해석한다. 서명 키가 서버 설정에 없으면 모두 401.
// 조회 서비스는 3초 안의 200 을 기다린다 — DB 수신 처리 한 번만 하고 바로 답한다.

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  // 너무 큰 본문은 읽기 전에 거절한다(서명 전에 하는 일은 크기 검사뿐이다)
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > MAX_WEBHOOK_BODY_BYTES) return Response.json({}, { status: 413, headers: NO_STORE });
  const rawBody = await req.text();
  const reply = await receiveDeliveryWebhook(
    {
      webhookSecret: readDeliveryApiWebhookSecret(process.env),
      ingest: (items) => ingestTrackingItems(createAdminSupabase(), items, "webhook"),
    },
    { timestamp: req.headers.get("x-webhook-timestamp"), signature: req.headers.get("x-webhook-signature"), rawBody, nowMs: Date.now() },
  ).catch((e: unknown) => {
    console.error("delivery/webhook: 처리 중 예외", e instanceof Error ? e.name : typeof e);
    return { status: 500, body: {} };
  });
  return Response.json(reply.body, { status: reply.status, headers: NO_STORE });
}
