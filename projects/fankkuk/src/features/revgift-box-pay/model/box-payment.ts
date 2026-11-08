import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PendingPayment, SuccessReturn } from "@/entities/payment/model/confirm";
import { runConfirmFlow, type ConfirmFailure } from "@/entities/payment/model/confirm-flow";
import type { Viewer } from "@/entities/session/model/viewer";
import type { TossPaymentsClient } from "@/shared/api/toss-payments/client";

// 선물함 명세서 결제 (revgift-box INV-GB18·GB19). 팬 선물·역조공 결제와 같은 대조·한 번만 확정 규칙(payment INV-M2·M3·M5)을 따른다.
// - 시작: 선물함 주인이 로그인 토큰으로 DB 함수를 불러 결제 대기를 만든다. 금액은 DB 가 저장된 명세서 금액으로 정한다 — 본문의 금액 칸은 읽지 않는다.
// - 확정: 결제창이 성공 주소로 돌아오면 앱 서버가 승인 API 를 부른다. 확정 시작은 DB 가 선물함 줄을 잠근 뒤 본다 —
//   명세서 + 168시간이 지났거나 반송으로 바뀌었으면 시작하지 않는다(INV-GB19 S19b).

export type BoxPayment = PendingPayment & { ownerId: string; boxId: string };

export interface BoxPaymentStore {
  find(orderId: string): Promise<BoxPayment | null>;
  /** 결제 대기 → 승인 중. 한 요청만, 선물함이 결제할 수 있을 때만 true. */
  claim(orderId: string): Promise<boolean>;
  /** 이번 호출이 기록을 바꿨는지. 이미 끝난 결제면 false. */
  settle(orderId: string, outcome: { status: "done"; paymentKey: string } | { status: "failed" }): Promise<boolean>;
}

/** 결제 완료로 기록한다 — 성공 주소의 확정과 결과를 모르는 결제 다시 확인(payment INV-M19)이 같이 쓴다. */
export function settleBoxDone(store: BoxPaymentStore, tossOrderId: string, paymentKey: string): Promise<boolean> {
  return store.settle(tossOrderId, { status: "done", paymentKey });
}

export type BoxConfirmOutcome = { ok: true; boxId: string } | { ok: false; reason: ConfirmFailure; boxId: string | null };

/** requesterId: 서버가 확인한 로그인 사용자. 선물함 주인의 결제만 처리한다 — 남의 결제는 없는 결제와 같다. */
export async function confirmBoxPayment(
  deps: { store: BoxPaymentStore; toss: TossPaymentsClient },
  requesterId: string | null,
  ret: SuccessReturn,
): Promise<BoxConfirmOutcome> {
  const isOwner = (r: BoxPayment) => requesterId !== null && r.ownerId === requesterId;
  const r = await runConfirmFlow<BoxPayment>(
    {
      find: (id) => deps.store.find(id),
      claim: (id) => deps.store.claim(id),
      settleFailed: (id) => deps.store.settle(id, { status: "failed" }),
      settleDone: (record, paymentKey) => settleBoxDone(deps.store, record.orderId, paymentKey),
      toss: deps.toss,
    },
    isOwner,
    ret,
  );
  if (r.ok) return { ok: true, boxId: r.record.boxId };
  // 실패해도 돌아갈 선물함 화면을 안다면 거기로 — 주인의 결제일 때만
  const record = await deps.store.find(ret.orderId).catch(() => null);
  return { ok: false, reason: r.reason, boxId: record && isOwner(record) ? record.boxId : null };
}

export type StartRefusal = { ok: false; status: 401 | 403 | 404 | 409; message: string };
export type StartResult = { ok: true; tossOrderId: string; amountKrw: number } | StartRefusal;

const MESSAGE = {
  login: "로그인이 필요합니다.",
  creatorOnly: "크리에이터 계정만 이용할 수 있습니다.",
  notFound: "선물함을 찾을 수 없습니다.",
  closed: "지금은 결제할 수 없습니다. 화면을 새로고침해 주세요.",
} as const;

const startReply = z.object({ toss_order_id: z.string().regex(/^gbpay_[0-9a-f]{32}$/), amount_krw: z.number().int().positive() }).strict();
const uuid = z.string().uuid();

/** 결제 대기 만들기. 결제할 수 없는 상태(명세서 전·결제됨·반송·168시간 지남)면 409 — DB 가 정한다. */
export async function startBoxPayment(deps: { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null }, boxId: string): Promise<StartResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: MESSAGE.login };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: MESSAGE.creatorOnly };
  if (!uuid.safeParse(boxId).success) return { ok: false, status: 404, message: MESSAGE.notFound };
  const { data, error } = await deps.client.rpc("revgift_box_start_payment", { p_box_id: boxId });
  if (error) {
    if (error.code === "P0002") return { ok: false, status: 404, message: MESSAGE.notFound };
    if (error.code === "P0022") return { ok: false, status: 409, message: MESSAGE.closed };
    throw new Error(`선물함 결제를 시작하지 못했다: ${error.code}`);
  }
  const r = startReply.parse(data);
  return { ok: true, tossOrderId: r.toss_order_id, amountKrw: r.amount_krw };
}
