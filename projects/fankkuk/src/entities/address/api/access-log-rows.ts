import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  ACCESS_DENY_REASONS,
  ACCESS_REQUESTERS,
  MAX_DECRYPTS_PER_BOX,
  type AccessMonthSummary,
  type AddressAccessEntry,
} from "../model/access-log";

// 크리에이터 「주소 열람 기록」을 DB 읽기 함수(my_access_log)로 읽는다 — INV-P7.
// 함수가 로그인한 크리에이터의 주문 기록만, 시각·주문번호·결과·출력 순번·거부 사유·대표 여부만 돌려준다.
// 응답은 여기서 형식을 검사하고, 결과와 칸이 어긋난 줄(열림인데 순번 없음 등)은 받지 않는다.

const at = z.iso.datetime({ offset: true });
const requester = z.enum(ACCESS_REQUESTERS);

const rowSchema = z.discriminatedUnion("result", [
  z.object({
    at,
    order_no: z.string().min(1),
    result: z.literal("opened"),
    print_no: z.number().int().min(1).max(MAX_DECRYPTS_PER_BOX),
    deny_reason: z.null(),
    requester,
  }),
  z.object({
    at,
    order_no: z.string().min(1),
    result: z.literal("denied"),
    print_no: z.null(),
    deny_reason: z.enum(ACCESS_DENY_REASONS),
    requester,
  }),
]);

export function parseAccessLogRows(rows: unknown): AddressAccessEntry[] {
  return z
    .array(rowSchema)
    .parse(rows)
    .map((r) => ({
      at: new Date(r.at).toISOString(),
      orderNo: r.order_no,
      requester: r.requester,
      result: r.result === "opened" ? { kind: "opened", printNo: r.print_no } : { kind: "denied", reason: r.deny_reason },
    }));
}

/** limit 을 주면 최신 줄부터 그만큼만(1~100), 없으면 기록 전부(INV-P7). */
export async function readMyAccessLog(client: Pick<SupabaseClient, "rpc">, limit?: number): Promise<AddressAccessEntry[]> {
  const { data, error } = await (limit === undefined ? client.rpc("my_access_log") : client.rpc("my_access_log", { p_limit: limit }));
  if (error) throw new Error(`열람 기록을 읽지 못했다: ${error.code}`);
  return parseAccessLogRows(data);
}

const count = z.number().int().nonnegative();
// 함수는 언제나 한 줄을 돌려준다
const summaryRows = z.tuple([z.object({ approved_count: count, opened_count: count, reprint_count: count, denied_count: count })]);

export function parseAccessMonthSummary(rows: unknown): AccessMonthSummary {
  const [r] = summaryRows.parse(rows);
  return { approvedCount: r.approved_count, openedCount: r.opened_count, reprintCount: r.reprint_count, deniedCount: r.denied_count };
}

/** 로그인한 크리에이터의 이번 달(서울 기준) 승인·열림·재출력·거부 수. DB 가 센다. */
export async function readMyAccessMonthSummary(client: Pick<SupabaseClient, "rpc">): Promise<AccessMonthSummary> {
  const { data, error } = await client.rpc("my_access_month_summary");
  if (error) throw new Error(`이번 달 숫자를 읽지 못했다: ${error.code}`);
  return parseAccessMonthSummary(data);
}
