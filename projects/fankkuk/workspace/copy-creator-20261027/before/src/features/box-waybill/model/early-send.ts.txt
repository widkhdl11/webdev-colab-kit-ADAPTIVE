import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "@/entities/session/model/viewer";
import { pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 「먼저 보내기」 (approval-signature INV-S9, 2026-10-08 사용자 지시). 크리에이터가 아직 승인하지 않은 주문은
// 팬이 안내(거절되면 반송될 수 있다)를 보고 이 버튼을 눌러야 받는 주소 6자리가 나온다. 누른 시각은 DB 가 주문에 한 번 남긴다.
// 주문번호만 넘긴다 — 누구 주문인지·결제가 끝난 진행 중 주문인지는 DB 가 로그인 토큰으로 판정한다(남의 주문은 404).

export const MESSAGE_EARLY_SEND_UNAVAILABLE = "현재 먼저 보내기를 이용할 수 없는 선물입니다. 새로고침해 주세요.";

const body = z.object({ orderNo: z.string().regex(/^FC-[0-9A-Z]{3,10}(-[0-9]{1,2})?$/) }).strict();

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export async function ackEarlySend(deps: Deps, input: unknown): Promise<JsonReply> {
  if (!deps.viewer) return { status: 401, body: { message: "로그인이 필요해요." } };
  if (deps.viewer.role !== "fan" && deps.viewer.role !== "creator") return { status: 403, body: { message: "권한이 없어요." } };
  const shaped = body.safeParse(input);
  if (!shaped.success) return { status: 400, body: { message: "잘못된 요청이에요." } };
  const { error } = await deps.client.rpc("ack_early_send", { p_order_no: shaped.data.orderNo });
  if (error) {
    if (error.code === "P0002") return { status: 404, body: { message: MESSAGE_EARLY_SEND_UNAVAILABLE } };
    return pgErrorReply(error.code, { limit: "잘못된 요청이에요.", failed: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
  return { status: 200, body: { acknowledged: true } };
}
