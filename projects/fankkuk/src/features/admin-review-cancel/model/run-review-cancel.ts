import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { fullCancelVerdict, type FullCancelVerdict } from "@/shared/api/toss-payments/cancel-outcome";
import type { TossPaymentsClient } from "@/shared/api/toss-payments/client";

// 「확인 필요」 결제의 전액 취소 (payment INV-M20, 정책 문제집 메모 B16).
// 결제사는 승인됐다는데 금액이 기록과 다르거나 부분 취소된 결제 — 업계 표준대로 전액 취소하고 결제는 실패로, 팬에게 다시 결제를 안내한다(INV-N19).
// 1) 운영자·대표인지 DB 에 묻는다(아니면 404 / 403).
// 2) 잡기 — 대표 로그인 토큰으로 DB 함수를 불러 취소 기록을 「처리 중」으로. 금액·결제 키는 DB 가 표시 때 남긴 값이다 — 화면은 보내지 않는다.
//    두 번째 누름은 여기서 「처리 중」·「이미 취소」로 막혀 결제사까지 가지 않는다.
// 3) 결제사 취소 한 번 — 취소 금액을 비워 남은 금액 전부를 취소한다. 표시 뒤 결제사 화면에서 일부를 더 취소했어도 남은 것만 취소된다
//    (기록한 금액으로 보내면 남은 금액보다 커져 결제사가 거절하고, 같은 키로 다시 해도 풀리지 않는다).
//    멱등 키 = 취소 기록 ID. 다시 시도해도 같은 키라 결제사는 첫 요청의 결과를 돌려준다.
// 4) 결과 기록 — 앱 서버 키로. 성공이면 같은 처리에서 결제가 실패로 닫히고 팬 알림 줄이 생긴다.
//    결제사가 분명히 거절했을 때만 실패로 남긴다. 응답을 못 받았거나 알아볼 수 없으면 결제사에서 취소가 됐을 수도 있다 —
//    기록을 「처리 중」으로 둔다. 그동안 늦게 돌아온 원래 승인은 완료가 되지 못하고(INV-M20 ④), 2분 뒤 같은 멱등 키로 다시 부르면 결제사가 첫 결과를 돌려준다.

export type ReviewCancelReply = { status: number; body: Record<string, unknown> };

export type ReviewCancelDeps = {
  /** 로그인한 사람의 세션 클라이언트 — DB 가 그 토큰의 사람이 대표인지 본다 */
  session: Pick<SupabaseClient, "rpc">;
  /** 앱 서버 키 클라이언트 — 결과 기록 전용 */
  admin: Pick<SupabaseClient, "rpc">;
  toss: Pick<TossPaymentsClient, "cancel">;
};

const CANCEL_REASON = "결제 금액 확인 불가로 전액 취소";

const MESSAGE = {
  notFound: "찾을 수 없어요.",
  ownerOnly: "결제 취소는 대표만 할 수 있어요.",
  badRequest: "잘못된 요청이에요.",
  notCancelable: "지금 상태에서는 취소할 수 없어요. 결제사 관리 화면에서 확인해 주세요.",
  alreadyDone: "이미 취소했어요.",
  inProgress: "취소를 처리하고 있어요. 잠시 뒤 새로고침해 주세요.",
  failed: "취소하지 못했어요. 잠시 뒤 다시 해 주세요.",
  unrecorded: "결제사 결과를 기록하지 못했어요. 2분 뒤 새로고침해서 상태를 확인해 주세요.",
  settledElsewhere: "다른 요청이 먼저 결과를 남겼어요. 새로고침해서 상태를 확인해 주세요.",
  pgFailed: "결제사 취소가 실패했어요. 다시 누르면 같은 요청으로 다시 시도해요.",
  pgUnknown: "결제사 응답을 받지 못해 취소됐는지 알 수 없어요. 2분 뒤 새로고침해서 다시 눌러 주세요. 같은 요청으로 확인해요.",
} as const;

// 금액 칸이 섞여 오면 받지 않는다(strict) — 금액은 DB 가 정한다(INV-M20 ①).
const bodyShape = z.object({ source: z.enum(["initial", "difference", "revgift"]), tossOrderId: z.string().min(1).max(64) }).strict();
const claimShape = z.array(z.object({ cancel_id: z.uuid(), payment_key: z.string().min(1), amount_krw: z.number().int().positive() }).strict()).length(1);

function claimErrorReply(code: string | undefined): ReviewCancelReply {
  if (code === "42501") return { status: 403, body: { message: MESSAGE.ownerOnly } };
  if (code === "P0002") return { status: 404, body: { message: MESSAGE.notFound } };
  if (code === "P0022") return { status: 409, body: { message: MESSAGE.notCancelable } };
  if (code === "P0023") return { status: 409, body: { message: MESSAGE.alreadyDone } };
  if (code === "P0024") return { status: 409, body: { message: MESSAGE.inProgress } };
  return { status: 500, body: { message: MESSAGE.failed } };
}

export async function runReviewCancel(deps: ReviewCancelDeps, body: unknown): Promise<ReviewCancelReply> {
  // admin-console INV-K1 S1c: 운영자가 아니면 관리자 기능이 있는 줄도 모르게 404. 직원 운영자는 403.
  const access = await readAdminAccess(deps.session);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE.notFound } };
  if (access !== "owner") return { status: 403, body: { message: MESSAGE.ownerOnly } };

  const input = bodyShape.safeParse(body);
  if (!input.success) return { status: 400, body: { message: MESSAGE.badRequest } };

  const claimed = await deps.session.rpc("admin_claim_review_cancel", { p_source: input.data.source, p_toss_order_id: input.data.tossOrderId });
  if (claimed.error) return claimErrorReply(claimed.error.code);
  const rows = claimShape.safeParse(claimed.data);
  if (!rows.success) return { status: 500, body: { message: MESSAGE.failed } };
  const { cancel_id: cancelId, payment_key: paymentKey, amount_krw: amountKrw } = rows.data[0]!;

  let verdict: FullCancelVerdict;
  try {
    const res = await deps.toss.cancel({ paymentKey, cancelReason: CANCEL_REASON, idempotencyKey: cancelId });
    verdict = fullCancelVerdict(res, paymentKey);
  } catch {
    verdict = { kind: "unknown" };
  }
  // 결과를 모르면 기록하지 않는다 — 「처리 중」으로 남는다
  if (verdict.kind === "unknown") return { status: 502, body: { message: MESSAGE.pgUnknown } };

  const settled = await deps.admin.rpc("settle_review_cancel", {
    p_cancel_id: cancelId,
    p_ok: verdict.kind === "ok",
    p_error: verdict.kind === "rejected" ? verdict.error : null,
  });
  if (settled.error) return { status: 500, body: { message: MESSAGE.unrecorded } };
  // 기록이 이미 「처리 중」이 아니면 다른 요청이 결과를 남긴 것이다
  if (settled.data !== true) return { status: 409, body: { message: MESSAGE.settledElsewhere } };
  if (verdict.kind === "rejected") return { status: 502, body: { message: MESSAGE.pgFailed } };
  return { status: 200, body: { ok: true, canceledKrw: amountKrw } };
}
