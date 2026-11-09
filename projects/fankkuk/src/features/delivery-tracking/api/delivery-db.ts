import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { NormalizedTrackingItem } from "@/shared/api/delivery-api/normalize";
import { toIngestPayload, type IngestCounts } from "../model/receive-webhook";
import type { PendingTracking } from "../model/subscribe-sweep";
import type { TraceTarget } from "../model/manual-trace";

// 배송 조회 DB 호출 — 수신 처리·구독 대기 줄은 서버 키(관리자 클라이언트)로, 운영자 조회 대상은 로그인한 운영자의 세션으로 부른다.
// 응답은 경계에서 꼴을 본다.

type Rpc = Pick<SupabaseClient, "rpc">;

const counts = z.object({ saved: z.number().int().nonnegative(), ignored: z.number().int().nonnegative() });

export async function ingestTrackingItems(admin: Rpc, items: NormalizedTrackingItem[], origin: "webhook" | "trace"): Promise<IngestCounts> {
  const { data, error } = await admin.rpc("delivery_ingest", { p_items: toIngestPayload(items), p_origin: origin });
  if (error) throw new Error(`배송 수신 처리 실패: ${error.code}`);
  return counts.parse(data);
}

const pendingRow = z.object({ id: z.string().uuid(), courier_code: z.enum(["cj", "post"]), waybill_no: z.string().regex(/^[0-9]{10,14}$/) });

export async function claimPendingTrackings(admin: Rpc, limit: number): Promise<PendingTracking[]> {
  const { data, error } = await admin.rpc("delivery_subscribe_claim", { p_limit: limit });
  if (error) throw new Error(`구독 대기 줄을 잡지 못했다: ${error.code}`);
  return z
    .array(pendingRow)
    .parse(data)
    .map((r) => ({ id: r.id, courierCode: r.courier_code, waybillNo: r.waybill_no }));
}

export async function saveSubscribeResult(admin: Rpc, ids: string[], errorCode: string | null): Promise<void> {
  const { error } = await admin.rpc("delivery_subscribe_result", { p_ids: ids, p_error: errorCode });
  if (error) throw new Error(`구독 결과를 저장하지 못했다: ${error.code}`);
}

const targetRow = z.object({ tracking_id: z.string().uuid(), courier_code: z.enum(["cj", "post"]), waybill_no: z.string().regex(/^[0-9]{10,14}$/) });

export async function readTraceTargets(session: Rpc, ids: string[]): Promise<TraceTarget[] | "forbidden"> {
  const { data, error } = await session.rpc("admin_delivery_trace_targets", { p_ids: ids });
  if (error?.code === "42501") return "forbidden";
  if (error) throw new Error(`조회 대상을 읽지 못했다: ${error.code}`);
  return z
    .array(targetRow)
    .parse(data)
    .map((r) => ({ trackingId: r.tracking_id, courierCode: r.courier_code, waybillNo: r.waybill_no }));
}
