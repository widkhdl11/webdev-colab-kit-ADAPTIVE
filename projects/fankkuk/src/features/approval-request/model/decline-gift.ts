import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { APPROVAL_EXPIRED_MESSAGE } from "@/entities/order/config/approval-deadline";
import type { Viewer } from "@/entities/session/model/viewer";

// 받지 않기(거절)와 「앞으로 받지 않기(차단)」 저장 (decline-block INV-D1·D2·D4·D8).
// 요청한 사람의 세션 클라이언트로 DB 함수 decline_gift 를 부른다 — DB 가 로그인 토큰으로 그 주문의 크리에이터인지 다시 확인하고,
// 누구를 차단할지는 주문의 보낸 사람 칸에서 읽는다. 본문에서는 요청 식별값과 차단 여부 두 칸만 꺼낸다(사람·계정 칸은 읽지 않는다).
// 카카오 서명은 없다 — 거절은 주소를 여는 방향이 아니다(approval-signature 비범위).

const inputSchema = z.object({
  requestId: z.string().regex(/^apr_[0-9A-Za-z]{1,40}$/),
  block: z.boolean(),
});

const replySchema = z.object({
  result: z.enum(["declined", "already", "not_declinable", "expired", "not_found"]),
  also_declined: z.array(z.string()),
});

/** ok 이면 차단으로 함께 거절된 다른 주문번호 — 화면이 그 줄을 막는다(닉네임은 겹칠 수 있어 쓰지 않는다). DB 가 직접 돌려준다. */
export type DeclineGiftResult =
  | { ok: true; alsoDeclinedOrderNos: string[] }
  | { ok: false; status: 400 | 401 | 403 | 404 | 409; message: string };

export async function declineGift(
  deps: { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null },
  body: unknown,
): Promise<DeclineGiftResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 이용할 수 있습니다." };

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "잘못된 요청입니다." };

  const { data, error } = await deps.client.rpc("decline_gift", {
    p_request_id: parsed.data.requestId,
    p_block: parsed.data.block,
  });
  if (error) throw new Error(`받지 않기를 저장하지 못했다: ${error.code}`);
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  const reply = replySchema.parse(data);
  if (reply.result === "not_found") return { ok: false, status: 404, message: "승인 요청을 찾을 수 없습니다." };
  if (reply.result === "already") return { ok: false, status: 409, message: "이미 처리된 요청입니다. 새로고침해 결과를 확인해 주세요." };
  // INV-D2: 168시간이 지났으면 자동 처리 전이라도 거절하지 않는다 — 승인과 같은 문구
  if (reply.result === "expired") return { ok: false, status: 409, message: APPROVAL_EXPIRED_MESSAGE };
  if (reply.result === "not_declinable") return { ok: false, status: 409, message: "현재 거절할 수 없는 선물입니다. 새로고침해 주세요." };
  return { ok: true, alsoDeclinedOrderNos: reply.also_declined };
}
