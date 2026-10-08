import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 7일 자동 처리를 지금 돌리기 (office-workflow INV-W6). 운영자(대표·직원) 누구나. 24시간 지난 결제 대기 닫기(payment INV-M15 · reverse-gift INV-R15)도 같이 돈다.
// 주문번호를 주면 그 주문(역조공은 그 몫)만, 안 주면 전부. 같은 대상을 두 번 처리하지 않는 것과
// 사람의 처리(승인·받기·매칭·차액 결제)와 겹칠 때 하나만 반영되는 것은 DB 자동 처리 함수가 지킨다.
// 자동 처리가 끝나면 결과를 모르는 결제 다시 확인(payment INV-M19)을 같은 범위(주문번호, 없으면 전부)로 한 번 돌린다 —
// 결제사 비밀 키는 앱 서버만 가지므로 DB 자동 처리 안에서는 못 한다. 실행 함수는 부르는 쪽(app)이 조립해 넘긴다.
// 운영자 판정(readAdminAccess·DB 자동 처리 함수)을 통과한 뒤에만 부른다. 실패한 줄이 있으면 성공으로 보이지 않게 500.

export const ORDER_NO_MAX = 40;

const MESSAGE_SHAPE = "주문번호 꼴이 맞지 않아요.";
const FAILED = "자동 처리를 돌리지 못했어요. 잠시 뒤 다시 해 주세요.";
const RECONCILE_FAILED = "자동 처리는 끝났지만 결제를 다시 확인하지 못한 줄이 있어요. 잠시 뒤 다시 해 주세요.";

/** 결제 다시 확인 실행(payment INV-M19). counts 는 줄 수 — 그대로 화면에 넘긴다. */
export type PaymentReconcileRun = (orderNo: string | null) => Promise<{ ok: boolean; counts: Record<string, number> }>;

const bodyShape = z.object({ orderNo: z.string().regex(/^[A-Z0-9-]+$/).max(ORDER_NO_MAX).optional() }).strict();
export type ExpiryRunWrite = z.input<typeof bodyShape>;

const counts = z.object({
  gifts: z.number().int(),
  unmatched: z.number().int(),
  differences: z.number().int(),
  revgifts: z.number().int(),
  // 24시간 지난 결제 대기를 닫은 수(payment INV-M15 · reverse-gift INV-R15)
  pending_gifts: z.number().int(),
  pending_revgifts: z.number().int(),
  // 168시간 지나 반송 대기로 넘긴 보관(추적 장치) 상자 수(office-workflow INV-W4·W6)
  held: z.number().int(),
});

export async function runExpiry(client: Pick<SupabaseClient, "rpc">, body: unknown, reconcile: PaymentReconcileRun): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_SHAPE } };

  const { data, error } = await client.rpc("office_run_expiry", { p_order_no: shaped.data.orderNo ?? null });
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_SHAPE, failed: FAILED });
  const parsed = counts.safeParse(data);
  if (!parsed.success) return { status: 500, body: { message: FAILED } };

  let payments;
  try {
    payments = await reconcile(shaped.data.orderNo ?? null);
  } catch {
    return { status: 500, body: { message: RECONCILE_FAILED, counts: parsed.data } };
  }
  if (!payments.ok) return { status: 500, body: { message: RECONCILE_FAILED, counts: parsed.data, payments: payments.counts } };
  return { status: 200, body: { counts: parsed.data, payments: payments.counts } };
}
