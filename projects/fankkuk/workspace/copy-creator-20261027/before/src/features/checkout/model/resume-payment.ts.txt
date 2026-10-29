import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ORDER_NO_PATTERN } from "@/entities/order/model/order-no";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 결제 이어 하기 (payment INV-M22). 팬이 지금 할 일 줄·선물 상세 맨 위 칸의 「결제하기」를 누른다 → 결제창에 넘길 결제 번호·금액.
// ① 금액은 그 주문의 처음 결제 대기 기록에 저장된 값이다 — 브라우저는 금액을 보내지 않고, 요금표를 다시 읽지도 않는다(INV-M1).
// ② 누를 때마다 DB 가 새 결제 번호를 만들고 앞 시도를 「대체됨」으로 닫는다. 결제창이 끝나면 기존 성공 주소(/api/checkout/success)가 승인한다.
// ⑤ 누구의 주문인지·24시간 전인지는 DB 함수가 로그인 토큰으로 판정한다 — 관리자 키를 쓰지 않는다(차액 결제 준비와 같은 자리).

const bodyShape = z.object({ orderNo: z.string().regex(ORDER_NO_PATTERN) }).strict();
export type ResumePaymentWrite = z.input<typeof bodyShape>;

const prepared = z.array(z.object({ toss_order_id: z.string().min(6), amount_krw: z.number().int().positive(), order_no: z.string() })).length(1);

const MESSAGE = {
  shape: "요청 형식이 올바르지 않습니다.",
  // 남의 주문·없는 주문·닫힌 주문·결제가 끝난 주문은 같은 문구(INV-M22 ⑤) — 어느 쪽인지 드러나지 않는다
  notFound: "결제할 선물을 찾을 수 없습니다.",
  busy: "결제 처리 중입니다. 잠시 후 새로고침해 주세요.",
  failed: "결제를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

export async function prepareResume(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE.shape } };
  const { data, error } = await client.rpc("resume_gift_payment", { p_order_no: shaped.data.orderNo });
  if (error) {
    if (error.code === "P0002" || error.code === "42501") return { status: 404, body: { message: MESSAGE.notFound } };
    if (error.code === "P0024") return { status: 409, body: { message: MESSAGE.busy } };
    return { status: 500, body: { message: MESSAGE.failed } };
  }
  const parsed = prepared.safeParse(data);
  if (!parsed.success) return { status: 500, body: { message: MESSAGE.failed } };
  const r = parsed.data[0]!;
  return { status: 200, body: { orderId: r.toss_order_id, amountKrw: r.amount_krw, orderNo: r.order_no } };
}
