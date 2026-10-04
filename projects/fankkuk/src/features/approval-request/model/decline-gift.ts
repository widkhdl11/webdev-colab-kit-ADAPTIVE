import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "@/entities/session/model/viewer";

// 받지 않기(거절)와 「앞으로 받지 않기(차단)」 저장 (decline-block INV-D1·D2·D4).
// 요청한 사람의 세션 클라이언트로 DB 함수 decline_gift 를 부른다 — DB 가 로그인 토큰으로 그 주문의 크리에이터인지 다시 확인하고,
// 누구를 차단할지는 주문의 보낸 사람 칸에서 읽는다. 본문에서는 요청 식별값과 차단 여부 두 칸만 꺼낸다(사람·계정 칸은 읽지 않는다).
// 카카오 서명은 없다 — 거절은 주소를 여는 방향이 아니다(approval-signature 비범위).

const inputSchema = z.object({
  requestId: z.string().regex(/^apr_[0-9A-Za-z]{1,40}$/),
  block: z.boolean(),
});

/** ok 이면 저장 뒤에도 승인 대기로 남은 주문번호 — 화면이 차단으로 함께 거절된 줄을 가려내는 데 쓴다(닉네임은 겹칠 수 있어 쓰지 않는다). */
export type DeclineGiftResult =
  | { ok: true; waitingOrderNos: string[] }
  | { ok: false; status: 400 | 401 | 403 | 404 | 409; message: string };

const NOT_FOUND = "찾을 수 없는 요청이에요.";

export async function declineGift(
  deps: { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null },
  body: unknown,
): Promise<DeclineGiftResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 할 수 있어요." };

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "잘못된 요청이에요." };

  const { data, error } = await deps.client.rpc("decline_gift", {
    p_request_id: parsed.data.requestId,
    p_block: parsed.data.block,
  });
  if (error) throw new Error(`받지 않기를 저장하지 못했다: ${error.code}`);
  if (data === "not_found") return { ok: false, status: 404, message: NOT_FOUND };
  if (data === "already") return { ok: false, status: 409, message: "이미 처리된 요청이에요. 새로 고침하면 결과가 보여요." };
  if (data === "not_declinable") return { ok: false, status: 409, message: "지금은 받지 않기로 할 수 없는 선물이에요. 새로 고침해 주세요." };
  if (data !== "declined") throw new Error(`받지 않기 결과를 알 수 없다: ${String(data)}`);

  const waiting = await deps.client.rpc("my_approval_requests");
  if (waiting.error) throw new Error(`승인 요청을 다시 읽지 못했다: ${waiting.error.code}`);
  const rows = z.array(z.object({ order_no: z.string() })).parse(waiting.data);
  return { ok: true, waitingOrderNos: rows.map((r) => r.order_no) };
}
