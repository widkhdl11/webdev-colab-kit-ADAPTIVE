import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CREATOR_CHECK_DAYS } from "@/entities/parcel/model/creator-check";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 크리에이터가 고른 블루투스 상자·추적기 보관 상자의 운영자 처리 (office-workflow INV-W13·W14). 운영자(직원·대표)가 크리에이터가 고른 것을 보고 처리 버튼을 누르면
// 그 선택이 잠기고 받기 선택은 검수 완료, 거절 선택은 반송 대기로 넘어간다. 요청에는 운영자가 화면에서 본 선택이 함께 간다 —
// 화면을 연 뒤 크리에이터가 취소하고 다르게 고른 것을 잘못 처리하지 않게, 지금 선택과 다르면 DB 가 「바뀜」으로 거부한다.
// 처리한 운영자·시각은 운영자 기록에만 남고 크리에이터에게 가지 않는다(address-protection INV-P7). 운영자가 아니면 404.

const processShape = z.object({ qr: z.string().regex(/^Q-[0-9]{6}$/), seen: z.enum(["accept", "return", "report", "no_report"]) }).strict();
export type CreatorCheckProcessWrite = z.input<typeof processShape>;

// reported·not_reported = 추적기 보관 상자의 신고하기·신고하지 않기 처리(office-workflow INV-W14). expired = 기한(168시간)이 지나 자동 처리를 기다림
const replySchema = z.enum(["accepted", "returned", "reported", "not_reported", "no_choice", "changed", "processed", "closed", "expired", "not_found"]);

const REFUSED = {
  no_choice: "크리에이터가 고른 것이 없어요(취소했어요). 목록을 새로 고침해 주세요.",
  changed: "크리에이터가 선택을 바꿨어요. 목록을 새로 고침해 주세요.",
  processed: "이미 처리된 상자예요.",
  closed: "선물이 끝나 처리할 수 없는 상자예요.",
  not_found: "찾을 수 없는 상자예요.",
  expired: `${CREATOR_CHECK_DAYS}일이 지나 자동 처리를 기다리는 상자예요.`,
} as const;

/** 운영자 목록 한 줄 — QR·주문번호·상자 순번·크리에이터의 선택·고른 시각·기한(보낸 팬·크리에이터 칸은 없다) */
export type CreatorCheckChoiceRow = { qr: string; orderNo: string; boxSeq: number; choice: "accept" | "return" | "report" | "no_report"; chosenAt: string; dueAt: string };

const rowsSchema = z.array(
  z.object({ qr: z.string(), order_no: z.string(), box_seq: z.number().int(), choice: z.enum(["accept", "return", "report", "no_report"]), chosen_at: z.string(), due_at: z.string() }).strict(),
);

type Rpc = Pick<SupabaseClient, "rpc">;

/** 운영자 목록 읽기 — 고른 것이 있고 처리 전인 상자. 운영자가 아니면 DB 가 0줄을 준다. 꼴이 다르면 던진다 */
export async function readCreatorCheckChoices(client: Rpc): Promise<CreatorCheckChoiceRow[]> {
  const { data, error } = await client.rpc("admin_creator_check_choices");
  if (error) throw new Error(`크리에이터가 고른 상자를 읽지 못했다: ${error.code}`);
  return rowsSchema.parse(data ?? []).map((r) => ({ qr: r.qr, orderNo: r.order_no, boxSeq: r.box_seq, choice: r.choice, chosenAt: r.chosen_at, dueAt: r.due_at }));
}

export async function processCreatorCheck(client: Rpc, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = processShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: "잘못된 요청이에요." } };
  const { data, error } = await client.rpc("office_process_creator_check", { p_qr: shaped.data.qr, p_seen_choice: shaped.data.seen });
  if (error?.code === "40001") return { status: 409, body: { message: "잠시 뒤 다시 해 주세요." } };
  if (error) return pgErrorReply(error.code, { limit: "잘못된 요청이에요.", failed: "처리하지 못했어요. 잠시 뒤 다시 해 주세요." });
  const reply = replySchema.safeParse(data);
  // 모르는 답이면 처리됐다고 단정하지 않는다
  if (!reply.success) return { status: 500, body: { message: "처리하지 못했어요. 잠시 뒤 다시 해 주세요." } };
  if (reply.data === "accepted" || reply.data === "returned" || reply.data === "reported" || reply.data === "not_reported") return { status: 200, body: { result: reply.data } };
  return { status: reply.data === "not_found" ? 404 : 409, body: { message: REFUSED[reply.data] } };
}
