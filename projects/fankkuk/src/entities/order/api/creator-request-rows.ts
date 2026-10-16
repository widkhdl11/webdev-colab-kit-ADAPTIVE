import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DecidedRequestView } from "../model/decided-request";

// 크리에이터에게 온 승인 요청을 DB 읽기 함수(my_decided_requests — 승인 요청 대기 줄은 크리에이터 처리할 일 읽기, action-center INV-J6)로 읽는다.
// 함수가 로그인한 크리에이터의 것만, 크리에이터가 봐도 되는 칸만 돌려준다. 응답은 여기서 형식을 검사한다.

const ts = z.string().min(1);
const iso = (v: string) => new Date(v).toISOString();

const decidedSchema = z.object({
  order_no: z.string().min(1),
  fan_nickname: z.string(),
  item_kind: z.string(),
  box_count: z.number().int().nonnegative(),
  outcome: z.enum(["approved", "declined", "blocked", "expired"]),
  decided_at: ts,
});

/** blocked = 주문이 거절됐고 그 팬이 지금 차단돼 있다(DB 가 판정). 차단을 풀면 declined 로 온다. */
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

export async function readMyDecidedRequests(client: Pick<SupabaseClient, "rpc">): Promise<DecidedRequestView[]> {
  const { data, error } = await client.rpc("my_decided_requests");
  if (error) throw new Error(`처리한 요청을 읽지 못했다: ${error.code}`);
  return parseDecidedRequestRows(data);
}
