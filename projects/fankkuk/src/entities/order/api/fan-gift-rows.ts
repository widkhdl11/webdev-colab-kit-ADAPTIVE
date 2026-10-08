import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { OFFICE_ADDRESS } from "../config/office-address";
import { toFanView, type FanGiftView, type FanOrderRecord } from "../model/fan-view";

// 팬의 선물을 DB 읽기 함수(my_gifts)로 읽는다. 함수가 로그인한 팬의 것만, 팬이 봐도 되는 칸만 돌려준다.
// 응답은 신뢰 경계 밖이라 여기서 형식을 검사하고 팬 화면 모양(toFanView)으로 바꾼다.
// 결제 대기 주문은 함수가 돌려주지 않는다. 승인은 상태가 아니라 approved_at 칸이다.

const ts = z.string().min(1);

const rowSchema = z.object({
  order_no: z.string().min(1),
  creator_name: z.string(),
  item_kind: z.string(),
  box_count: z.number().int().nonnegative(),
  has_electronics_or_metal: z.boolean(),
  status: z.enum(["registered", "received", "labeled", "inspected", "label_printed", "shipped", "rejected", "expired", "canceled"]),
  registered_at: ts,
  approved_at: ts.nullable(),
  received_at: ts.nullable(),
  inspection_result: z.enum(["passed", "returned"]).nullable(),
  inspected_at: ts.nullable(),
  shipped_at: ts.nullable(),
  expected_arrival_date: z.string().nullable(),
  delivery: z.enum(["in_transit", "delivered"]).nullable(),
  fan_tracking_no: z.string().nullable(),
  fan_send_ack_at: ts.nullable(),
});

/** DB 시각(+00:00)을 화면 코드가 쓰는 ISO(Z) 꼴로. */
const iso = (v: string) => new Date(v).toISOString();
const isoOrNull = (v: string | null) => (v === null ? null : iso(v));

function toRecord(r: z.infer<typeof rowSchema>): FanOrderRecord {
  return {
    orderNo: r.order_no,
    creatorName: r.creator_name,
    itemKind: r.item_kind,
    boxCount: r.box_count,
    hasElectronicsOrMetal: r.has_electronics_or_metal,
    status: r.status,
    registeredAt: iso(r.registered_at),
    approvedAt: isoOrNull(r.approved_at),
    receivedAt: isoOrNull(r.received_at),
    inspection: r.inspection_result && r.inspected_at ? { result: r.inspection_result, at: iso(r.inspected_at) } : null,
    shippedAt: isoOrNull(r.shipped_at),
    expectedArrivalDate: r.expected_arrival_date,
    delivery: r.delivery,
    fanTrackingNo: r.fan_tracking_no,
    fanSendAckAt: isoOrNull(r.fan_send_ack_at),
  };
}

export function parseFanGiftRows(rows: unknown, officeAddress: string): FanGiftView[] {
  return z
    .array(rowSchema)
    .parse(rows)
    .map((r) => toFanView(toRecord(r), officeAddress));
}

/** 로그인한 팬의 선물, 최신 등록 순. 로그인하지 않았으면 함수가 거부한다 — 부르는 쪽이 먼저 로그인을 확인한다. */
export async function readMyGiftViews(client: Pick<SupabaseClient, "rpc">): Promise<FanGiftView[]> {
  const { data, error } = await client.rpc("my_gifts");
  if (error) throw new Error(`선물 목록을 읽지 못했다: ${error.code}`);
  return parseFanGiftRows(data, OFFICE_ADDRESS);
}
