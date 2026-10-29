import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ORDER_NO_PATTERN } from "@/entities/order/model/order-no";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";

// 대표의 입고 뒤 취소 (payment INV-M17). 1:1 문의로 받은 취소를 대표가 관리자 화면에서 처리한다 — 운영자가 아니면 404, 직원 운영자는 403.
// 대상은 상자가 하나라도 도착했고 출고 송장을 출력하기 전인 진행 중 주문. 환불 대상은 결제 금액에서 도착한 상자마다 검수비·배송비를 뺀 값이다.
// 대표 판정·주문 상태 판정·기록 한 줄은 DB 함수가 최종으로 한다. 여기서는 어긋난 입력을 DB 까지 보내지 않는다.

export const CANCEL_REASON_MAX = 200;

export const MESSAGE_REASON = `사유를 1~${CANCEL_REASON_MAX}자로 적어 주세요.`;
export const MESSAGE_ORDER_NO = "주문번호를 FC-7K3M9 꼴 그대로 적어 주세요.";
const MESSAGE_OWNER_ONLY = "입고 뒤 취소는 대표만 할 수 있어요.";
export const MESSAGE_CAUGHT_BOX = "검수에서 걸린 상자가 있어 취소할 수 없어요. 이 주문은 검수 불합격 반송으로 처리돼요.";
export const MESSAGE_NOT_CANCELABLE = "입고 뒤 취소를 할 수 있는 주문이 아니에요. 상자가 도착했는지, 송장을 출력하지 않았는지 확인해 주세요.";

const bodyShape = z
  .object({
    orderNo: z.string(),
    reason: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => charCount(s) >= 1 && charCount(s) <= CANCEL_REASON_MAX),
  })
  .strict();

export type ReceivedGiftCancelWrite = z.input<typeof bodyShape>;

/** client = 로그인한 사람의 세션 클라이언트. 대표 판정은 DB 가 그 토큰의 사람으로 한다 — 관리자 키를 쓰면 이 판정이 사라진다. */
export async function cancelReceivedGift(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  const access = await readAdminAccess(client);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (access !== "owner") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) {
    // 어느 칸이 틀렸는지 맞는 문구로 — 주문번호 칸이 빠졌는데 사유 문구가 나가면 대표가 엉뚱한 칸을 고친다
    const orderNoBad = shaped.error.issues.some((i) => i.path[0] === "orderNo");
    return { status: 400, body: { message: orderNoBad ? MESSAGE_ORDER_NO : MESSAGE_REASON } };
  }
  const { orderNo, reason } = shaped.data;
  if (!ORDER_NO_PATTERN.test(orderNo)) return { status: 400, body: { message: MESSAGE_ORDER_NO } };
  const { error } = await client.rpc("admin_cancel_received_gift", { p_order_no: orderNo, p_reason: reason });
  // 앱이 대표로 본 뒤 DB 가 거부하면(그 사이 대표가 바뀜) 앞의 403 과 같은 문구로
  if (error?.code === "42501") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
  if (error?.code === "P0002") return { status: 409, body: { message: MESSAGE_NOT_CANCELABLE } };
  if (error?.code === "P0061") return { status: 409, body: { message: MESSAGE_CAUGHT_BOX } };
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_REASON, failed: "취소하지 못했어요. 잠시 뒤 다시 해 주세요." });
  return { status: 200, body: { ok: true } };
}
