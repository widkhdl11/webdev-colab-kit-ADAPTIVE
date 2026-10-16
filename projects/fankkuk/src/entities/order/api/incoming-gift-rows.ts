import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { IncomingGiftView } from "../model/incoming-gift";

// 크리에이터가 받은 선물의 진행 단계를 DB 읽기 함수(my_incoming_gifts, office-workflow INV-W9)로 읽는다.
// 함수가 인자 없이 로그인한 크리에이터에게 온 결제 완료 주문만, 정해진 칸만 돌려준다. 응답은 여기서 형식을 검사한다 —
// 정해지지 않은 칸이 섞여 오면(strict) 받지 않는다.

const ts = z.string().min(1);
const iso = (v: string) => new Date(v).toISOString();
const isoOrNull = (v: string | null) => (v === null ? null : iso(v));

const rowSchema = z
  .object({
    order_no: z.string().min(1),
    sender_nickname: z.string(),
    box_count: z.number().int().nonnegative(),
    stage: z.enum(["paid", "received", "inspected", "shipped", "in_transit", "delivered", "returned", "closed"]),
    paid_at: ts,
    received_at: ts.nullable(),
    inspected_at: ts.nullable(),
    shipped_at: ts.nullable(),
    // held = 보관 — 위치 추적기 상자의 신고 선택·신고 보관·경찰 인계(office-workflow INV-W9·W14)
    inspection_result: z.enum(["passed", "returned", "held"]).nullable(),
    delivery: z.enum(["in_transit", "delivered"]).nullable(),
  })
  .strict();

export function parseIncomingGiftRows(rows: unknown): IncomingGiftView[] {
  return z
    .array(rowSchema)
    .parse(rows)
    .map((r) => ({
      orderNo: r.order_no,
      senderNickname: r.sender_nickname,
      boxCount: r.box_count,
      stage: r.stage,
      paidAt: iso(r.paid_at),
      receivedAt: isoOrNull(r.received_at),
      inspectedAt: isoOrNull(r.inspected_at),
      shippedAt: isoOrNull(r.shipped_at),
      inspection: r.inspection_result,
      delivery: r.delivery,
    }));
}

/** 로그인한 크리에이터가 받은 선물, 최신 등록 순. */
export async function readMyIncomingGifts(client: Pick<SupabaseClient, "rpc">): Promise<IncomingGiftView[]> {
  const { data, error } = await client.rpc("my_incoming_gifts");
  if (error) throw new Error(`받은 선물을 읽지 못했다: ${error.code}`);
  return parseIncomingGiftRows(data);
}
