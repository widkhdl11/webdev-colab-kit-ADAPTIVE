import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ORDER_NO_PATTERN } from "@/entities/order/model/order-no";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";
import { CANCEL_REASON_MAX, MESSAGE_ORDER_NO, MESSAGE_REASON } from "./cancel-received-gift";

// 크리에이터 사정으로 취소 (payment INV-M21). 크리에이터가 1:1 문의로 탈퇴 등을 요청해 진행 중인 선물을 더 처리할 수 없게 되면
// 대표가 그 크리에이터가 받는 출고 전 주문을 취소한다 — 운영자가 아니면 404, 직원 운영자는 403. 환불은 거절·반려 줄(검수비를 빼지 않는다).
// 대표 판정·주문 상태 판정·기록 한 줄은 DB 함수(admin_cancel_for_creator)가 최종으로 한다. 여기서는 어긋난 입력을 DB 까지 보내지 않는다.
// 이 처리에만 있는 거절(대표만·취소할 수 없는 주문)은 아래 문장으로 돌려준다(용어집 3절 운영자 열 「크리에이터 사정 취소」).

const MESSAGE_CREATOR_CANCEL_OWNER_ONLY = "크리에이터 사정 취소는 대표만 할 수 있어요.";
const MESSAGE_CREATOR_CANCEL_NOT_CANCELABLE = "크리에이터 사정 취소를 할 수 있는 주문이 아니에요. 출고 송장을 출력하기 전의 진행 중인 주문인지 확인해 주세요.";

const bodyShape = z
  .object({
    orderNo: z.string(),
    reason: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => charCount(s) >= 1 && charCount(s) <= CANCEL_REASON_MAX),
  })
  .strict();

export type CreatorCancelWrite = z.input<typeof bodyShape>;

/** client = 로그인한 사람의 세션 클라이언트. 대표 판정은 DB 가 그 토큰의 사람으로 한다 — 관리자 키를 쓰면 이 판정이 사라진다. */
export async function cancelForCreator(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  const access = await readAdminAccess(client);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (access !== "owner") return { status: 403, body: { message: MESSAGE_CREATOR_CANCEL_OWNER_ONLY } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) {
    const orderNoBad = shaped.error.issues.some((i) => i.path[0] === "orderNo");
    return { status: 400, body: { message: orderNoBad ? MESSAGE_ORDER_NO : MESSAGE_REASON } };
  }
  const { orderNo, reason } = shaped.data;
  if (!ORDER_NO_PATTERN.test(orderNo)) return { status: 400, body: { message: MESSAGE_ORDER_NO } };
  const { error } = await client.rpc("admin_cancel_for_creator", { p_order_no: orderNo, p_reason: reason });
  if (error?.code === "42501") return { status: 403, body: { message: MESSAGE_CREATOR_CANCEL_OWNER_ONLY } };
  if (error?.code === "P0002") return { status: 409, body: { message: MESSAGE_CREATOR_CANCEL_NOT_CANCELABLE } };
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_REASON, failed: "취소하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  return { status: 200, body: { ok: true } };
}
