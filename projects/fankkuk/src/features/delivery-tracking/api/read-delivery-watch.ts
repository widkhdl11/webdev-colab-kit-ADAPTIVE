import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 운영자 「배송 조회」 칸 (delivery-status INV-DS14). 운영자가 아니면 DB 가 빈 목록을 준다.
// 송장번호는 끝 네 자리만, 이력·원본 칸은 없다(INV-DS10) — 다른 칸이 섞여 오면 받지 않는다(strict).

export type DeliveryWatchRow = {
  trackingId: string;
  kind: "gift" | "revgift" | "gift_box";
  waybillLast4: string;
  carrierState: "picked_up" | "in_transit" | "delivered" | null;
  lastStatus: string | null;
  subscribeState: "pending" | "subscribed";
  subscribeError: string | null;
  since: string;
  lastEventAt: string | null;
  stale: boolean;
};

const row = z
  .object({
    tracking_id: z.string().uuid(),
    kind: z.enum(["gift", "revgift", "gift_box"]),
    waybill_last4: z.string().regex(/^[0-9]{4}$/),
    carrier_state: z.enum(["picked_up", "in_transit", "delivered"]).nullable(),
    last_status: z.string().regex(/^[A-Z_]{1,30}$/).nullable(),
    subscribe_state: z.enum(["pending", "subscribed"]),
    subscribe_error: z.string().regex(/^[A-Za-z0-9_]{1,60}$/).nullable(),
    since: z.string(),
    last_event_at: z.string().nullable(),
    stale: z.boolean(),
  })
  .strict();

export function parseDeliveryWatch(data: unknown): DeliveryWatchRow[] {
  return z
    .array(row)
    .parse(data)
    .map((r) => ({
      trackingId: r.tracking_id,
      kind: r.kind,
      waybillLast4: r.waybill_last4,
      carrierState: r.carrier_state,
      lastStatus: r.last_status,
      subscribeState: r.subscribe_state,
      subscribeError: r.subscribe_error,
      since: r.since,
      lastEventAt: r.last_event_at,
      stale: r.stale,
    }));
}

export async function readDeliveryWatch(client: Pick<SupabaseClient, "rpc">): Promise<DeliveryWatchRow[]> {
  const { data, error } = await client.rpc("admin_delivery_watch");
  if (error) throw new Error(`배송 조회 현황을 읽지 못했다: ${error.code}`);
  return parseDeliveryWatch(data);
}
