import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import type { TossPaymentsClient } from "@/shared/api/toss-payments/client";

// 환불 실행 (admin-console INV-K2·K7, payment INV-M8·M9, reverse-gift INV-R11).
// 1) 운영자·대표인지 DB 에 묻는다(아니면 404 / 403).
// 2) 잡기 — 대표 로그인 토큰으로 DB 함수를 불러 금액을 정하고 기록을 「처리 중」으로 잡는다. 화면은 금액을 보내지 않는다.
//    두 번째 누름은 여기서 「처리 중」·「이미 환불」로 막혀 결제사까지 가지 않는다.
// 3) 결제사 취소 한 번 — 멱등 키 = 환불 기록 ID. 다시 시도해도 같은 키라 결제사는 첫 요청의 결과를 돌려준다.
// 4) 결과 기록 — 앱 서버 키로 완료·실패를 남긴다. 기록에 실패하면 「처리 중」으로 남고, 2분 뒤 같은 키로 다시 할 수 있다.

export type RefundReply = { status: number; body: Record<string, unknown> };

export type RefundDeps = {
  /** 로그인한 사람의 세션 클라이언트 — DB 가 그 토큰의 사람이 대표인지 본다. 관리자 키를 쓰면 이 판정이 사라진다 */
  session: Pick<SupabaseClient, "rpc">;
  /** 앱 서버 키 클라이언트 — 결과 기록 전용 */
  admin: Pick<SupabaseClient, "rpc">;
  toss: Pick<TossPaymentsClient, "cancel">;
};

const CANCEL_REASON = "팬꾹 환불";

const MESSAGE = {
  notFound: "찾을 수 없어요.",
  ownerOnly: "환불은 대표만 할 수 있어요.",
  badRequest: "잘못된 요청이에요.",
  notRefundable: "지금 상태에서는 환불할 수 없어요.",
  alreadyDone: "이미 환불했어요.",
  inProgress: "환불을 처리하고 있어요. 잠시 뒤 새로고침해 주세요.",
  failed: "환불하지 못했어요. 잠시 뒤 다시 해 주세요.",
  pgFailed: "결제사 취소가 실패했어요. 「다시 시도」로 다시 할 수 있어요.",
} as const;

// 금액 칸이 섞여 오면 받지 않는다(strict) — 금액은 DB 가 정한다(INV-K7).
const bodyShape = z.object({ kind: z.enum(["gift", "revgift"]), unitId: z.uuid() }).strict();
const claimShape = z.array(z.object({ refund_id: z.uuid(), payment_key: z.string().min(1), amount_krw: z.number().int().positive() }).strict()).length(1);

/** DB 잡기 오류 코드 → 응답. */
function claimErrorReply(code: string | undefined): RefundReply {
  if (code === "42501") return { status: 403, body: { message: MESSAGE.ownerOnly } };
  if (code === "P0002") return { status: 404, body: { message: MESSAGE.notFound } };
  if (code === "P0022") return { status: 409, body: { message: MESSAGE.notRefundable } };
  if (code === "P0023") return { status: 409, body: { message: MESSAGE.alreadyDone } };
  if (code === "P0024") return { status: 409, body: { message: MESSAGE.inProgress } };
  return { status: 500, body: { message: MESSAGE.failed } };
}

const cancelShape = z.object({
  paymentKey: z.string(),
  status: z.string(),
  cancels: z.array(z.object({ cancelAmount: z.number(), cancelStatus: z.string() })),
});
const errorShape = z.object({ code: z.string(), message: z.string() });

/**
 * 결제사 취소 응답이 이 환불의 성공인가. 결제 키가 같고, 취소 상태(전체·부분)이고, 이 금액의 취소 완료 줄이 있어야 성공.
 * 실패면 기록에 남길 오류 문구(200자 안).
 */
export function cancelOutcome(res: unknown, paymentKey: string, amountKrw: number): { ok: true } | { ok: false; error: string } {
  const done = cancelShape.safeParse(res);
  if (
    done.success &&
    done.data.paymentKey === paymentKey &&
    (done.data.status === "CANCELED" || done.data.status === "PARTIAL_CANCELED") &&
    done.data.cancels.some((c) => c.cancelAmount === amountKrw && c.cancelStatus === "DONE")
  ) {
    return { ok: true };
  }
  const err = errorShape.safeParse(res);
  const text = err.success ? `${err.data.code} ${err.data.message}` : "결제사 응답을 알아볼 수 없음";
  return { ok: false, error: text.slice(0, 200) };
}

export async function runRefund(deps: RefundDeps, body: unknown): Promise<RefundReply> {
  // INV-K1 S1c: 운영자가 아니면 관리자 기능이 있는 줄도 모르게 404. INV-K2: 직원 운영자는 403.
  const access = await readAdminAccess(deps.session);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE.notFound } };
  if (access !== "owner") return { status: 403, body: { message: MESSAGE.ownerOnly } };

  const input = bodyShape.safeParse(body);
  if (!input.success) return { status: 400, body: { message: MESSAGE.badRequest } };

  const claimed = await deps.session.rpc("admin_claim_refund", { p_kind: input.data.kind, p_unit_id: input.data.unitId });
  if (claimed.error) return claimErrorReply(claimed.error.code);
  const rows = claimShape.safeParse(claimed.data);
  if (!rows.success) return { status: 500, body: { message: MESSAGE.failed } };
  const { refund_id: refundId, payment_key: paymentKey, amount_krw: amountKrw } = rows.data[0]!;

  let outcome: { ok: true } | { ok: false; error: string };
  try {
    const res = await deps.toss.cancel({ paymentKey, cancelAmount: amountKrw, cancelReason: CANCEL_REASON, idempotencyKey: refundId });
    outcome = cancelOutcome(res, paymentKey, amountKrw);
  } catch {
    outcome = { ok: false, error: "결제사에 닿지 못함" };
  }

  const settled = await deps.admin.rpc("settle_refund", {
    p_refund_id: refundId,
    p_ok: outcome.ok,
    p_error: outcome.ok ? null : outcome.error,
  });
  if (settled.error) return { status: 500, body: { message: MESSAGE.failed } };
  if (!outcome.ok) return { status: 502, body: { message: MESSAGE.pgFailed } };
  return { status: 200, body: { ok: true, refundKrw: amountKrw } };
}
