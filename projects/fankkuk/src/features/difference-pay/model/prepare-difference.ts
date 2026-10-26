import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 팬이 선물 상세에서 「차액 결제하기」를 누른다 → 결제창에 넘길 결제 번호·금액 (payment INV-M1·M11·M13).
// 금액은 운영자가 실측을 기록할 때 DB 가 정한 값이다 — 브라우저가 금액을 보내지 않는다.
// 누구의 상자인지·낼 수 있는 상태인지는 DB 함수가 로그인 토큰으로 판정한다(INV-L3) — 관리자 키를 쓰지 않는다.

const bodyShape = z.object({ boxId: z.string().uuid() }).strict();
export type DifferencePrepareWrite = z.input<typeof bodyShape>;

const prepared = z.array(z.object({ toss_order_id: z.string().min(6), amount_krw: z.number().int().positive(), order_no: z.string() })).length(1);

const MESSAGE = {
  shape: "요청 형식이 올바르지 않습니다.",
  notFound: "차액 결제 요청을 찾을 수 없습니다.",
  closed: "결제 기한이 지났거나 현재 결제할 수 없는 차액입니다.",
  paid: "이미 결제한 차액입니다.",
  busy: "결제 처리 중입니다. 잠시 후 새로고침해 주세요.",
  failed: "결제를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

export async function prepareDifference(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE.shape } };
  const { data, error } = await client.rpc("prepare_difference_payment", { p_box_id: shaped.data.boxId });
  if (error) {
    if (error.code === "P0002" || error.code === "42501") return { status: 404, body: { message: MESSAGE.notFound } };
    if (error.code === "P0022") return { status: 409, body: { message: MESSAGE.closed } };
    if (error.code === "P0023") return { status: 409, body: { message: MESSAGE.paid } };
    if (error.code === "P0024") return { status: 409, body: { message: MESSAGE.busy } };
    return { status: 500, body: { message: MESSAGE.failed } };
  }
  const parsed = prepared.safeParse(data);
  if (!parsed.success) return { status: 500, body: { message: MESSAGE.failed } };
  const r = parsed.data[0]!;
  return { status: 200, body: { orderId: r.toss_order_id, amountKrw: r.amount_krw, orderNo: r.order_no } };
}
