import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ApprovalRequestView } from "../model/creator-view";
import type { DecidedRequestView } from "../model/decided-request";

// 크리에이터에게 온 승인 요청을 DB 읽기 함수(my_approval_requests·my_decided_requests)로 읽는다.
// 함수가 로그인한 크리에이터의 것만, 크리에이터가 봐도 되는 칸만 돌려준다. 응답은 여기서 형식을 검사한다.

const ts = z.string().min(1);
const iso = (v: string) => new Date(v).toISOString();

const waitingSchema = z.object({
  request_id: z.string().min(1),
  order_no: z.string().min(1),
  fan_nickname: z.string(),
  item_kind: z.string(),
  box_count: z.number().int().nonnegative(),
  has_electronics_or_metal: z.boolean(),
  registered_at: ts,
  received_at: ts.nullable(),
});

const decidedSchema = z.object({
  order_no: z.string().min(1),
  fan_nickname: z.string(),
  item_kind: z.string(),
  box_count: z.number().int().nonnegative(),
  outcome: z.enum(["approved", "declined", "expired"]),
  decided_at: ts,
});

export function parseApprovalRequestRows(rows: unknown): ApprovalRequestView[] {
  return z
    .array(waitingSchema)
    .parse(rows)
    .map((r) => ({
      orderNo: r.order_no,
      fanNickname: r.fan_nickname,
      itemKind: r.item_kind,
      boxCount: r.box_count,
      hasElectronicsOrMetal: r.has_electronics_or_metal,
      registeredAt: iso(r.registered_at),
      receivedAt: r.received_at === null ? null : iso(r.received_at),
    }));
}

/** 차단(blocked)은 아직 DB 에 없다 — 팬 차단을 만들 때 함께 넣는다. */
export function parseDecidedRequestRows(rows: unknown): DecidedRequestView[] {
  return z
    .array(decidedSchema)
    .parse(rows)
    .map((r) => ({
      orderNo: r.order_no,
      fanNickname: r.fan_nickname,
      itemKind: r.item_kind,
      boxCount: r.box_count,
      outcome: r.outcome,
      decidedAt: iso(r.decided_at),
    }));
}

export async function readMyApprovalRequests(client: Pick<SupabaseClient, "rpc">): Promise<ApprovalRequestView[]> {
  const { data, error } = await client.rpc("my_approval_requests");
  if (error) throw new Error(`승인 요청을 읽지 못했다: ${error.code}`);
  return parseApprovalRequestRows(data);
}

export async function readMyDecidedRequests(client: Pick<SupabaseClient, "rpc">): Promise<DecidedRequestView[]> {
  const { data, error } = await client.rpc("my_decided_requests");
  if (error) throw new Error(`처리한 요청을 읽지 못했다: ${error.code}`);
  return parseDecidedRequestRows(data);
}
