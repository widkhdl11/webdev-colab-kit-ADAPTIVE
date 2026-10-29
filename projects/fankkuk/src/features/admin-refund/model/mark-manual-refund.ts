import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";

// 「직접 환불함」 — 팬꾹 밖(결제사 관리 화면·계좌 이체)에서 돌려준 환불을 완료로 적는다 (admin-console INV-K7 S7d·S7e, 카드 d126).
// 1) 운영자·대표인지 DB 에 묻는다(아니면 404 / 403).
// 2) 대표 로그인 토큰으로 DB 함수 한 번 — 상태(실패·멈춘 처리 중만)·메모(1~200자, 숫자 10자리 이상 거부)·잠금·한 번만은 DB 가 본다.
//    결제사는 부르지 않는다. 금액은 보내지 않는다 — 기록된 금액 그대로다.

export type ManualRefundReply = { status: number; body: Record<string, unknown> };

export type ManualRefundDeps = {
  /** 로그인한 사람의 세션 클라이언트 — DB 가 그 토큰의 사람이 대표인지 본다 */
  session: Pick<SupabaseClient, "rpc">;
};

export const MANUAL_REFUND_MESSAGE = {
  notFound: "요청한 항목을 찾을 수 없습니다.",
  ownerOnly: "환불은 대표만 할 수 있어요.",
  badRequest: "유효하지 않은 요청입니다.",
  memoLength: "메모를 1~200자로 써 주세요.",
  memoDigits: "메모에 연락처나 계좌번호는 쓰지 마세요. 숫자가 10자리 이상 이어지면 받지 않아요.",
  notClaimed: "아직 환불을 누르지 않은 기록이에요. 「환불」부터 눌러 주세요.",
  alreadyDone: "이미 환불했어요.",
  inProgress: "환불을 처리하고 있어요. 2분 뒤 새로고침해서 상태를 확인해 주세요.",
  failed: "기록하지 못했어요. 잠시 뒤 다시 해 주세요.",
} as const;

// 메모 길이는 DB 가 다시 본다(앞뒤 빈칸을 뺀 1~200자) — 여기서는 터무니없이 긴 본문만 DB 앞에서 끊는다.
const bodyShape = z
  .object({ kind: z.enum(["gift", "gift_box", "revgift"]), unitId: z.uuid(), memo: z.string().max(1000) })
  .strict();

function errorReply(code: string | undefined): ManualRefundReply {
  const m = MANUAL_REFUND_MESSAGE;
  if (code === "42501") return { status: 403, body: { message: m.ownerOnly } };
  if (code === "P0002") return { status: 404, body: { message: m.notFound } };
  if (code === "P0026") return { status: 400, body: { message: m.memoLength, field: "memo" } };
  if (code === "P0027") return { status: 400, body: { message: m.memoDigits, field: "memo" } };
  if (code === "P0022") return { status: 409, body: { message: m.notClaimed } };
  if (code === "P0023") return { status: 409, body: { message: m.alreadyDone } };
  if (code === "P0024") return { status: 409, body: { message: m.inProgress } };
  return { status: 500, body: { message: m.failed } };
}

export async function markManualRefund(deps: ManualRefundDeps, body: unknown): Promise<ManualRefundReply> {
  // INV-K1 S1c: 운영자가 아니면 관리자 기능이 있는 줄도 모르게 404. INV-K2: 직원 운영자는 403.
  const access = await readAdminAccess(deps.session);
  if (access === "not_found") return { status: 404, body: { message: MANUAL_REFUND_MESSAGE.notFound } };
  if (access !== "owner") return { status: 403, body: { message: MANUAL_REFUND_MESSAGE.ownerOnly } };

  const input = bodyShape.safeParse(body);
  if (!input.success) return { status: 400, body: { message: MANUAL_REFUND_MESSAGE.badRequest } };

  const marked = await deps.session.rpc("admin_mark_refund_manual", {
    p_kind: input.data.kind,
    p_unit_id: input.data.unitId,
    p_memo: input.data.memo,
  });
  if (marked.error) return errorReply(marked.error.code);
  const amount = z.number().int().positive().safeParse(marked.data);
  if (!amount.success) return { status: 500, body: { message: MANUAL_REFUND_MESSAGE.failed } };
  return { status: 200, body: { ok: true, refundKrw: amount.data } };
}
