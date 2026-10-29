import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "@/entities/session/model/viewer";
import { pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 「아직 보내지 않음」 (office-workflow INV-W10 S10f, notifications INV-N15 — 2026-10-21 「도착하지 않은 상자는 30일 하나로, 알림 세 번」).
// 도착하지 않은 상자 알림·선물 상세의 버튼. 그 주문에 「고객 확인: 아직 안 보냄」과 누른 시각만 남기고(다시 누르면 시각만 바뀐다) 기한은 바꾸지 않는다.
// 주문번호만 넘긴다 — 누구 주문인지·진행 중이고 아직 안 온 상자가 있는지는 DB 가 로그인 토큰으로 판정한다(남의 주문은 404).

export const MESSAGE_NOT_SENT_UNAVAILABLE = "현재 미발송 상태를 등록할 수 없습니다. 새로고침해 주세요.";

const body = z.object({ orderNo: z.string().regex(/^FC-[0-9A-Z]{3,10}(-[0-9]{1,2})?$/) }).strict();
const answer = z.string().min(1);

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export async function markGiftNotSent(deps: Deps, input: unknown): Promise<JsonReply> {
  if (!deps.viewer) return { status: 401, body: { message: "로그인이 필요합니다." } };
  if (deps.viewer.role !== "fan" && deps.viewer.role !== "creator") return { status: 403, body: { message: "이 작업을 수행할 권한이 없습니다." } };
  const shaped = body.safeParse(input);
  if (!shaped.success) return { status: 400, body: { message: "유효하지 않은 요청입니다." } };
  const { data, error } = await deps.client.rpc("mark_gift_not_sent", { p_order_no: shaped.data.orderNo });
  if (error) {
    if (error.code === "P0002") return { status: 404, body: { message: MESSAGE_NOT_SENT_UNAVAILABLE } };
    return pgErrorReply(error.code, { limit: "유효하지 않은 요청입니다.", failed: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
  const at = answer.safeParse(data);
  // 모르는 답이면 남았다고 단정하지 않는다
  if (!at.success) return { status: 500, body: { message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." } };
  return { status: 200, body: { notSentAt: at.data } };
}
