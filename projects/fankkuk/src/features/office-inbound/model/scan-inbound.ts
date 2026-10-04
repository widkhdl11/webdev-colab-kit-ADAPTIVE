import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { officeErrorReply } from "@/entities/parcel/model/office-error";
import { parcelDetailFromData } from "@/entities/parcel/model/office-parcel";
import { qrCode, QR_PATTERN, waybillNo } from "@/entities/parcel/model/scan-code";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";

// 입고 화면의 서버 쪽 (office-workflow INV-W1·W2·W5·W7). 몸통의 kind 로 셋을 가른다.
// - waybill: 원 송장 스캔 → 입고 완료 + 라벨(1상자 1장) 또는 「미확인」·「이미 미확인으로 기록함」
// - label: 라벨 QR 스캔 → 부착 확인(이 작업자가 직전에 출력한 라벨이어야 한다 — DB 가 본다)
// - unmatched: 미확인 입고 기록(앞 한 글자 · 보관 선반만)
// 상태를 고르거나 주문번호를 넣는 칸은 없다(INV-W1) — strict 라 그런 칸이 오면 400.
// 운영자가 아니면 404. 최종 판정(지금 상태·작업자별 대기 라벨)은 DB 전환 함수가 행 잠금 뒤 한다(INV-W2).

export const SHELF_MAX = 20;

const MESSAGE_SCAN = "스캔한 값의 꼴이 맞지 않아요. 다시 스캔해 주세요.";
const MESSAGE_UNMATCHED = `보낸 사람은 앞 한 글자, 보관 선반 번호는 1~${SHELF_MAX}자로 적어 주세요.`;
const FAILED = "처리하지 못했어요. 잠시 뒤 다시 해 주세요.";
const MESSAGE_UNMATCHED_TAKEN = "이미 주인이 있거나 미확인 입고로 기록된 송장이에요.";

const senderInitial = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => charCount(s) === 1);
const shelf = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => charCount(s) >= 1 && charCount(s) <= SHELF_MAX);

const scanShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("waybill"), waybill: waybillNo }).strict(),
  z.object({ kind: z.literal("label"), qr: qrCode }).strict(),
]);
const unmatchedShape = z.object({ kind: z.literal("unmatched"), waybill: waybillNo, senderInitial, shelf }).strict();

export type InboundWrite =
  | z.input<typeof scanShape>
  | z.input<typeof unmatchedShape>;

const scanResult = z.discriminatedUnion("result", [
  z.object({ result: z.enum(["received", "reprinted"]), qr: z.string().regex(QR_PATTERN), order_no: z.string() }),
  z.object({ result: z.enum(["unmatched", "unmatched_recorded"]), qr: z.null(), order_no: z.null() }),
]);

/** client = 로그인한 사람의 세션 클라이언트. DB 가 그 토큰의 사람이 운영자인지, 그 작업자의 대기 라벨이 무엇인지 본다. */
export async function scanInbound(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };

  const isUnmatched = typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "unmatched";
  if (isUnmatched) {
    const shaped = unmatchedShape.safeParse(body);
    if (!shaped.success) return { status: 400, body: { message: MESSAGE_UNMATCHED } };
    const input = shaped.data;
    const { data, error } = await client.rpc("office_record_unmatched", { p_waybill: input.waybill, p_sender_initial: input.senderInitial, p_shelf: input.shelf });
    if (error) return officeErrorReply(error.code, { limit: MESSAGE_UNMATCHED, failed: FAILED, conflict: MESSAGE_UNMATCHED_TAKEN });
    return { status: 200, body: { ok: true, id: typeof data === "string" ? data : null } };
  }

  const shaped = scanShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_SCAN } };
  const input = shaped.data;
  const messages = { limit: MESSAGE_SCAN, failed: FAILED };

  if (input.kind === "label") {
    const { error } = await client.rpc("office_confirm_label", { p_qr: input.qr });
    if (error) return officeErrorReply(error.code, messages);
    return { status: 200, body: { ok: true } };
  }

  const { data, error } = await client.rpc("office_scan_inbound", { p_waybill: input.waybill });
  if (error) return officeErrorReply(error.code, messages);
  const result = scanResult.safeParse(data);
  if (!result.success) return { status: 500, body: { message: FAILED } };
  const r = result.data;
  if (r.result === "unmatched" || r.result === "unmatched_recorded") return { status: 200, body: { result: r.result, qr: null, orderNo: null, parcel: null } };

  // 결과 카드(종류·보낸 사람·구간)용. 입고는 이미 됐으니 이 조회가 실패해도 입고 결과는 그대로 알린다.
  const detail = await client.rpc("office_parcel_by_qr", { p_qr: r.qr });
  const parcel = detail.error ? null : parcelDetailFromData(detail.data);
  return { status: 200, body: { result: r.result, qr: r.qr, orderNo: r.order_no, parcel } };
}
