import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseAddressCode } from "@/entities/parcel/model/address-code";
import { CARRIERS } from "@/entities/parcel/model/carrier";
import { HOLD_REASONS } from "@/entities/parcel/model/office-lists";
import { officeErrorReply } from "@/entities/parcel/model/office-error";
import { parcelDetailFromData } from "@/entities/parcel/model/office-parcel";
import { qrCode, QR_PATTERN, waybillNo } from "@/entities/parcel/model/scan-code";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";

// 입고 화면의 서버 쪽 (office-workflow INV-W1·W2·W5·W7, inbound-address-code INV-C1·C4·C5). 몸통의 kind 로 둘을 가른다.
// - inbound: 원 송장 바코드 + 받는 주소 6자리(없으면 빈칸) → 입고 완료 + 라벨, 또는 보류.
//     6자리는 대소문자를 가리지 않고 대문자로 바꾼다. 20자 밖 글자가 있으면 확인 문자를 보기 전에, 확인 문자가 틀리면 그 자리에서
//     거부한다(400, 상태 변화 없음 — DB 를 부르지 않는다). DB 도 같은 검사를 한다(22023·P0046).
//     보류인데 택배사·송장 「보내는 분」 이름·선반 번호가 없으면 DB 가 아무것도 바꾸지 않고 need_details 를 준다 — 화면이 그 칸을 받아 다시 보낸다.
//     보내는 분 이름은 DB 가 닉네임과 비교만 하고 저장하지 않는다(INV-C5·W7, 카드 d94). 보류 결과에 닉네임 일치면 그 닉네임이 온다(없으면 null).
// - label: 라벨 QR 스캔 → 부착 확인(이 작업자가 직전에 출력한 라벨이어야 한다 — DB 가 본다)
// 상태를 고르거나 주문번호를 넣는 칸은 없다(INV-W1·C4) — strict 라 그런 칸이 오면 400.
// 운영자가 아니면 404. 최종 판정(6자리 상태·바코드 묶임·작업자별 대기 라벨)은 DB 입고 함수가 행 잠금 뒤 한다.
// 측정: 6자리를 넣은 입력마다 받아들였는지·거부했는지를 따로 남긴다(office_log_code_input — 값은 남기지 않는다).
//   기록이 실패해도 입고 결과는 그대로 돌려준다(측정용이다).

export const SHELF_MAX = 20;
/** 송장 「보내는 분」 이름 최대 글자 수 — DB 입고 함수와 같은 경계 */
export const SENDER_NAME_MAX = 40;

const MESSAGE_SCAN = "스캔한 값의 형식이 맞지 않아요. 다시 스캔해 주세요.";
const MESSAGE_DETAILS = `택배사를 고르고, 송장의 보내는 분 이름은 ${SENDER_NAME_MAX}자까지, 보관 선반 번호는 1~${SHELF_MAX}자로 적어 주세요.`;
export const MESSAGE_CODE_FORMAT = "받는 주소 끝 6자리에 쓰지 않는 글자가 있어요. 상자에 적힌 주소를 다시 보고 입력해 주세요.";
export const MESSAGE_CODE_CHECK = "받는 주소 끝 6자리가 맞지 않아요. 한 글자씩 다시 확인해 입력해 주세요.";
const FAILED = "처리하지 못했어요. 잠시 뒤 다시 해 주세요.";

const optionalText = z
  .string()
  .max(40)
  .transform((s) => s.trim())
  .optional();

const inboundShape = z
  .object({
    kind: z.literal("inbound"),
    barcode: waybillNo,
    code: z.string().max(40),
    carrier: z.enum(CARRIERS).optional(),
    senderName: optionalText,
    shelf: optionalText,
  })
  .strict();
const labelShape = z.object({ kind: z.literal("label"), qr: qrCode }).strict();

export type InboundWrite = z.input<typeof inboundShape> | z.input<typeof labelShape>;

const scanResult = z.discriminatedUnion("result", [
  z.object({ result: z.enum(["received", "reprinted"]), qr: z.string().regex(QR_PATTERN), order_no: z.string() }),
  z.object({ result: z.literal("hold"), reason: z.enum(HOLD_REASONS), nickname: z.string().nullable().optional() }),
  z.object({ result: z.literal("hold_recorded") }),
  z.object({ result: z.literal("need_details"), reason: z.enum(HOLD_REASONS) }),
]);

type Rpc = Pick<SupabaseClient, "rpc">;

async function logCodeInput(client: Rpc, outcome: "accepted" | "format" | "check"): Promise<void> {
  try {
    await client.rpc("office_log_code_input", { p_outcome: outcome });
  } catch {
    // 측정 기록 실패는 입고를 막지 않는다
  }
}

function codeReject(reason: "code_format" | "code_check"): JsonReply {
  return { status: 400, body: { message: reason === "code_format" ? MESSAGE_CODE_FORMAT : MESSAGE_CODE_CHECK, reason } };
}

/** client = 로그인한 사람의 세션 클라이언트. DB 가 그 토큰의 사람이 운영자인지, 그 작업자의 대기 라벨이 무엇인지 본다. */
export async function scanInbound(client: Rpc, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };

  const isLabel = typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "label";
  if (isLabel) {
    const shaped = labelShape.safeParse(body);
    if (!shaped.success) return { status: 400, body: { message: MESSAGE_SCAN } };
    const { error } = await client.rpc("office_confirm_label", { p_qr: shaped.data.qr });
    if (error) return officeErrorReply(error.code, { limit: MESSAGE_SCAN, failed: FAILED });
    return { status: 200, body: { ok: true } };
  }

  const shaped = inboundShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_SCAN } };
  const input = shaped.data;

  // INV-C1·C5: 6자리 정리·검사 — 틀리면 DB 를 부르지 않는다(상태 변화 없음)
  const parsed = parseAddressCode(input.code);
  if (!parsed.ok && parsed.reason !== "empty") {
    await logCodeInput(client, parsed.reason);
    return codeReject(parsed.reason === "format" ? "code_format" : "code_check");
  }
  const code = parsed.ok ? parsed.value : null;

  const senderName = input.senderName ?? "";
  const shelf = input.shelf ?? "";
  if (charCount(senderName) > SENDER_NAME_MAX || charCount(shelf) > SHELF_MAX) return { status: 400, body: { message: MESSAGE_DETAILS } };

  const { data, error } = await client.rpc("office_scan_inbound", {
    p_barcode: input.barcode,
    p_code: code,
    p_carrier: input.carrier ?? null,
    p_sender_name: senderName === "" ? null : senderName,
    p_shelf: shelf === "" ? null : shelf,
  });
  if (error?.code === "P0046") {
    await logCodeInput(client, "check");
    return codeReject("code_check");
  }
  if (error) return officeErrorReply(error.code, { limit: MESSAGE_SCAN, failed: FAILED });
  const result = scanResult.safeParse(data);
  if (!result.success) return { status: 500, body: { message: FAILED } };
  const r = result.data;
  if (code !== null && r.result !== "need_details") await logCodeInput(client, "accepted");

  if (r.result === "hold") return { status: 200, body: { result: r.result, reason: r.reason, nickname: r.nickname ?? null } };
  if (r.result === "need_details") return { status: 200, body: { result: r.result, reason: r.reason } };
  if (r.result === "hold_recorded") return { status: 200, body: { result: r.result } };

  // 결과 카드(종류·보낸 사람·구간)용. 입고는 이미 됐으니 이 조회가 실패해도 입고 결과는 그대로 알린다.
  const detail = await client.rpc("office_parcel_by_qr", { p_qr: r.qr });
  const parcel = detail.error ? null : parcelDetailFromData(detail.data);
  return { status: 200, body: { result: r.result, qr: r.qr, orderNo: r.order_no, parcel } };
}
