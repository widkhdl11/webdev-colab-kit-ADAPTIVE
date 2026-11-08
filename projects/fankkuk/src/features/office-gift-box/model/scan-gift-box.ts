import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { applicationStatusSchema, boxStatusSchema } from "@/entities/revgift-box/model/box-status";
import { INVOICE_TIERS } from "@/entities/revgift-box/model/box-tiers";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_FORBIDDEN, MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 선물함 입고·실측 화면의 서버 쪽 (revgift-box INV-GB10·GB12·GB13·GB16·GB23).
// - receive: 6자리로 큰 상자 하나 입고(착불 금액·원 송장번호·선반). 무효가 된 6자리면 보류(취소한 선물함이면 크리에이터 카드), 모르는 6자리면 unknown
// - lookup: 6자리로 선물함을 불러온다 — 선택된 신청의 닉네임·신청 번호·상태(손글씨 닉네임은 이 목록에서 찾는다)
// - measure: 선물 하나 — 바코드(신청 번호) 또는 손글씨 닉네임, 세 변 합(cm)·무게(kg), 대형 초과면 우체국 실비. 구간은 DB 가 정한다(INV-GB12)
// 운영자가 아니면 404. 금액·구간·상태를 고르는 칸은 없다.

const MESSAGE_SHAPE = "입력한 값의 형식이 맞지 않아요.";
const FAILED = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
export const COD_MAX_KRW = 100_000;
export const PERSONAL_MAX_KRW = 100_000;
export const GIFT_BOX_MESSAGE = {
  cod: `착불 택배비는 0원 이상 ${COD_MAX_KRW.toLocaleString("ko-KR")}원 이하의 원 단위 숫자로 입력해 주세요.`,
  measure: `실측 값을 확인해 주세요. 대형(140cm·15kg)을 넘으면 우체국 실비가 꼭 있어야 하고, 대형 택배비 이상 ${PERSONAL_MAX_KRW.toLocaleString("ko-KR")}원 이하만 받습니다.`,
  measured: "이미 실측한 선물이에요.",
  notArrived: "도착한 선물함만 실측할 수 있어요. 큰 상자를 먼저 입고해 주세요.",
  notFound: "6자리에 맞는 선물함이 없어요. 6자리를 다시 확인해 주세요.",
} as const;

const code = z
  .string()
  .transform((v) => v.replace(/[^0-9A-Za-z]/g, "").toUpperCase())
  .pipe(z.string().regex(/^[0-9A-Z]{6}$/));

const bodyShape = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("receive"),
      code,
      waybillNo: z.string().regex(/^[0-9]{10,14}$/),
      codFeeKrw: z.number().int().min(0).max(COD_MAX_KRW),
      shelf: z.string().trim().min(1).max(20),
    })
    .strict(),
  z.object({ kind: z.literal("lookup"), code }).strict(),
  z
    .object({
      kind: z.literal("measure"),
      code,
      label: z
        .string()
        .transform((v) => v.trim().toUpperCase())
        .pipe(z.string().regex(/^GB[0-9]{1,12}$/))
        .optional(),
      nickname: z.string().trim().min(1).max(40).optional(),
      sizeCm: z.number().positive().max(1000),
      weightKg: z.number().positive().max(1000),
      personalKrw: z.number().int().min(1).max(PERSONAL_MAX_KRW).optional(),
    })
    .strict()
    .refine((m) => (m.label === undefined) !== (m.nickname === undefined)),
]);

export type GiftBoxWrite = z.input<typeof bodyShape>;

const receiveReply = z.discriminatedUnion("result", [
  z.object({ result: z.literal("received"), box_id: z.string().uuid(), box_name: z.string() }).strict(),
  z.object({ result: z.literal("held"), box_id: z.string().uuid(), box_name: z.string() }).strict(),
  z.object({ result: z.literal("unknown") }).strict(),
]);
const lookupReply = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    status: boxStatusSchema,
    carton_count: z.number().int().nullable(),
    cartons_received: z.number().int(),
    open_holds: z.number().int(),
    applications: z.array(z.object({ label: z.string(), nickname: z.string(), status: applicationStatusSchema, tier: z.enum(INVOICE_TIERS).nullable() }).strict()),
  })
  .strict();
const measureReply = z.discriminatedUnion("result", [
  z.object({ result: z.literal("measured"), nickname: z.string(), tier: z.enum(INVOICE_TIERS) }).strict(),
  z.object({ result: z.literal("held"), tier: z.enum(INVOICE_TIERS) }).strict(),
]);

function errorReply(errCode: string | undefined, messages: { badInput: string; conflict?: string }): JsonReply {
  if (errCode === "42501") return { status: 403, body: { message: MESSAGE_FORBIDDEN } };
  if (errCode === "22023") return { status: 400, body: { message: messages.badInput } };
  if (errCode === "P0002") return { status: 404, body: { message: GIFT_BOX_MESSAGE.notFound } };
  if (errCode === "P0022") return { status: 409, body: { message: GIFT_BOX_MESSAGE.notArrived } };
  if (errCode === "55000") return { status: 409, body: { message: messages.conflict ?? FAILED } };
  return { status: 500, body: { message: FAILED } };
}

export async function scanGiftBox(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) {
    const kind = (body as { kind?: unknown } | null)?.kind;
    return { status: 400, body: { message: kind === "receive" ? GIFT_BOX_MESSAGE.cod : kind === "measure" ? GIFT_BOX_MESSAGE.measure : MESSAGE_SHAPE } };
  }
  const input = shaped.data;

  if (input.kind === "receive") {
    const { data, error } = await client.rpc("office_gift_box_receive", {
      p_code: input.code,
      p_waybill_no: input.waybillNo,
      p_cod_fee_krw: input.codFeeKrw,
      p_shelf: input.shelf,
    });
    if (error) return errorReply(error.code, { badInput: GIFT_BOX_MESSAGE.cod });
    const r = receiveReply.safeParse(data);
    if (!r.success) return { status: 500, body: { message: FAILED } };
    return { status: 200, body: r.data.result === "unknown" ? { result: "unknown" } : { result: r.data.result, boxName: r.data.box_name } };
  }

  if (input.kind === "lookup") {
    const { data, error } = await client.rpc("office_gift_box_lookup", { p_code: input.code });
    if (error) return errorReply(error.code, { badInput: MESSAGE_SHAPE });
    const r = lookupReply.safeParse(data);
    if (!r.success) return { status: 500, body: { message: FAILED } };
    const b = r.data;
    return {
      status: 200,
      body: {
        box: { name: b.name, status: b.status, cartonCount: b.carton_count, cartonsReceived: b.cartons_received, openHolds: b.open_holds, applications: b.applications },
      },
    };
  }

  const { data, error } = await client.rpc("office_gift_box_measure", {
    p_code: input.code,
    p_label: input.label ?? null,
    p_nickname: input.nickname ?? null,
    p_size_cm: input.sizeCm,
    p_weight_kg: input.weightKg,
    p_personal_krw: input.personalKrw ?? null,
  });
  if (error) return errorReply(error.code, { badInput: GIFT_BOX_MESSAGE.measure, conflict: GIFT_BOX_MESSAGE.measured });
  const r = measureReply.safeParse(data);
  if (!r.success) return { status: 500, body: { message: FAILED } };
  return { status: 200, body: r.data };
}
