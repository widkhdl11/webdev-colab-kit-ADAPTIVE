import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ORDER_NO_PATTERN } from "@/entities/order/model/order-no";
import type { Viewer } from "@/entities/session/model/viewer";
import { pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 팬의 입고 전 취소 (payment INV-M16). 결제를 마친 주문의 보낸 사람이, 아직 상자가 하나도 입고되지 않았으면 선물 상세에서 직접 취소한다.
// 주문번호만 넘긴다 — 누구 주문인지·결제가 끝난 진행 중 주문인지·들어온 상자가 없는지는 DB 가 로그인 토큰으로 잠근 뒤 판정한다.
// 성공하면 주문은 취소된다. 받는 주소가 보인 적이 없으면 6자리는 무효·환불 대상은 결제 금액 전액, 보인 적이 있으면 안 온 상자의 6자리를 살려 두고
// 상자마다 배송비 칸을 뺀다(payment INV-M16·M18). 환불은 대표가 눌러야 나간다.

export const MESSAGE_CANCEL_UNAVAILABLE = "현재 취소할 수 없는 선물입니다. 새로고침해 주세요.";

const body = z.object({ orderNo: z.string().regex(ORDER_NO_PATTERN) }).strict();

export type GiftCancelWrite = z.input<typeof body>;

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export async function cancelMyGift(deps: Deps, input: unknown): Promise<JsonReply> {
  if (!deps.viewer) return { status: 401, body: { message: "로그인이 필요해요." } };
  if (deps.viewer.role !== "fan" && deps.viewer.role !== "creator") return { status: 403, body: { message: "권한이 없어요." } };
  const shaped = body.safeParse(input);
  if (!shaped.success) return { status: 400, body: { message: "잘못된 요청이에요." } };
  const { error } = await deps.client.rpc("cancel_my_gift", { p_order_no: shaped.data.orderNo });
  if (error) {
    // 남의 주문이거나 그 사이 상자가 입고됨 — 화면이 낡았다(409 면 화면이 다시 읽는다)
    if (error.code === "P0002") return { status: 409, body: { message: MESSAGE_CANCEL_UNAVAILABLE } };
    return pgErrorReply(error.code, { limit: "잘못된 요청이에요.", failed: "취소하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
  return { status: 200, body: { canceled: true } };
}
