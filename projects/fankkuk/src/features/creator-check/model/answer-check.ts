import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CREATOR_CHECK_DAYS } from "@/entities/parcel/model/creator-check";
import type { Viewer } from "@/entities/session/model/viewer";

// 크리에이터 확인의 답 저장 (2026-10-12 (2) 문제집 D3 ②, office-workflow INV-W4·W6).
// 요청한 사람의 세션 클라이언트로 DB 함수 answer_creator_check 를 부른다 — DB 가 로그인 토큰으로 그 주문의 크리에이터인지 다시 확인한다.
// 본문에서는 주문번호·상자 순번·답 세 칸만 꺼낸다(사람·계정 칸은 읽지 않는다). 주소를 여는 방향이 아니라 서명은 없다 —
// 받기는 상자를 통과시킬 뿐이고, 주소는 승인 서명 뒤 송장 출력 때만 열린다(approval-signature INV-S7 그대로).

const inputSchema = z
  .object({
    orderNo: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,39}$/),
    boxSeq: z.number().int().min(1).max(99),
    answer: z.enum(["accept", "return"]),
  })
  .strict();

const replySchema = z.enum(["accepted", "returned", "already", "expired", "closed", "not_found"]);

export type AnswerCheckResult = { ok: true; answer: "accepted" | "returned" } | { ok: false; status: 400 | 401 | 403 | 404 | 409; message: string };

export async function answerCreatorCheck(
  deps: { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null },
  body: unknown,
): Promise<AnswerCheckResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 할 수 있어요." };

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "잘못된 요청이에요." };

  const { data, error } = await deps.client.rpc("answer_creator_check", {
    p_order_no: parsed.data.orderNo,
    p_box_seq: parsed.data.boxSeq,
    p_answer: parsed.data.answer,
  });
  // 잠그는 사이 상자 연결이 바뀌었다(office_lock_parcel 의 40001) — 다시 하면 된다. 저장되지 않았다
  if (error?.code === "40001") return { ok: false, status: 409, message: "잠시 뒤 다시 시도해 주세요." };
  if (error) throw new Error(`확인할 선물의 답을 저장하지 못했다: ${error.code}`);
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  const reply = replySchema.parse(data);
  if (reply === "not_found") return { ok: false, status: 404, message: "찾을 수 없는 상자예요." };
  if (reply === "already") return { ok: false, status: 409, message: "이미 답한 상자예요. 새로 고침하면 결과가 보여요." };
  if (reply === "expired") return { ok: false, status: 409, message: `${CREATOR_CHECK_DAYS}일이 지나 보낸 분에게 돌려보내는 상자예요.` };
  if (reply === "closed") return { ok: false, status: 409, message: "선물이 끝나 더 답할 수 없는 상자예요. 새로 고침해 주세요." };
  return { ok: true, answer: reply };
}
