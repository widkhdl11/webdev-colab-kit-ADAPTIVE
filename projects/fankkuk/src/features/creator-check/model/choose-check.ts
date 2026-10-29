import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CREATOR_CHECK_DAYS } from "@/entities/parcel/model/creator-check";
import type { Viewer } from "@/entities/session/model/viewer";

// 블루투스 상자 받기·거절 고르기와 취소 (office-workflow INV-W13, action-center INV-J8). 요청한 사람의 세션 클라이언트로 DB 함수
// choose_creator_check · cancel_creator_check 를 부른다 — DB 가 로그인 토큰으로 그 주문의 크리에이터인지, 운영자 처리 전·기한 전인지 다시 본다.
// 고르기는 선택만 남긴다(상자는 확인 대기 그대로) — 운영자가 처리 버튼을 누르거나 기한이 지나야 상자가 움직인다. 서명은 없다(주소를 여는 방향이 아니다).
// 본문에서는 동작·주문번호·상자 순번(고르기면 선택까지)만 꺼낸다.

const target = { orderNo: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,39}$/), boxSeq: z.number().int().min(1).max(99) };
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("choose"), ...target, choice: z.enum(["accept", "return", "report", "no_report"]) }).strict(),
  z.object({ action: z.literal("cancel"), ...target }).strict(),
]);

export type CreatorCheckWrite = z.input<typeof inputSchema>;

const replySchema = z.enum(["chosen", "cancelled", "already_chosen", "not_chosen", "processed", "expired", "closed", "not_found"]);

export type ChooseCheckResult = { ok: true; state: "chosen" | "cancelled" } | { ok: false; status: 400 | 401 | 403 | 404 | 409; message: string };

const REFUSED: Record<Exclude<z.infer<typeof replySchema>, "chosen" | "cancelled">, { status: 404 | 409; message: string }> = {
  not_found: { status: 404, message: "상자를 찾을 수 없습니다." },
  already_chosen: { status: 409, message: "이미 선택한 항목이 있습니다. 변경하려면 먼저 선택을 취소해 주세요." },
  not_chosen: { status: 409, message: "취소할 선택 내역이 없습니다." },
  processed: { status: 409, message: "팬꾹에서 이미 처리한 상자입니다." },
  expired: { status: 409, message: `선택 기한인 ${CREATOR_CHECK_DAYS}일이 지나 변경할 수 없습니다.` },
  closed: { status: 409, message: "처리 대상이 아닌 상자입니다." },
};

export async function chooseCreatorCheck(deps: { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null }, body: unknown): Promise<ChooseCheckResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 이용할 수 있습니다." };
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "잘못된 요청입니다." };
  const input = parsed.data;
  const { data, error } =
    input.action === "choose"
      ? await deps.client.rpc("choose_creator_check", { p_order_no: input.orderNo, p_box_seq: input.boxSeq, p_choice: input.choice })
      : await deps.client.rpc("cancel_creator_check", { p_order_no: input.orderNo, p_box_seq: input.boxSeq });
  // 잠그는 사이 상자 연결이 바뀌었다(office_lock_parcel 의 40001) — 다시 하면 된다. 저장되지 않았다
  if (error?.code === "40001") return { ok: false, status: 409, message: "잠시 후 다시 시도해 주세요." };
  if (error) throw new Error(`블루투스 상자 선택을 저장하지 못했다: ${error.code}`);
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  const reply = replySchema.parse(data);
  if (reply === "chosen" || reply === "cancelled") {
    // 고르기에 「취소됨」, 취소에 「골라짐」이 오면 저장된 것이 요청과 다르다 — 성공으로 치지 않는다
    if ((input.action === "choose") !== (reply === "chosen")) throw new Error(`블루투스 상자 선택의 답이 요청과 다르다: ${reply}`);
    return { ok: true, state: reply };
  }
  return { ok: false, ...REFUSED[reply] };
}
