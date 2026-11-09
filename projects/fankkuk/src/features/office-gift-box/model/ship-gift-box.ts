import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AccessDenyReason } from "@/entities/address/model/access-log";
import { parseWaybillInput } from "@/entities/parcel/model/waybill-no";
import { applicationStatusSchema, boxStatusSchema, RETURN_REASONS } from "@/entities/revgift-box/model/box-status";
import { INVOICE_TIERS } from "@/entities/revgift-box/model/box-tiers";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_FORBIDDEN, MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 선물함 출고·반송 화면의 서버 쪽 (revgift-box INV-GB19·GB20).
// - lookup: 바코드(신청 번호)로 신청을 불러온다 — 선물함 이름·닉네임·상태·송장 출력·운송장·출고 여부·할증 지역 불일치. 주소 칸은 없다
// - print: 송장 출력(주소 열기 1회) — 대표만(address-protection INV-P8). 직원이 눌러도 송장 출력 함수까지 보내 그 함수가 거부 줄을 남기고,
//   직원에게는 어떤 결과든 라벨을 내주지 않는다(출고 화면 office-outbound 와 같은 두 겹)
// - set_waybill: 수동 입력 운송장 번호 — 대표만(직원이면 DB 가 거부 줄을 남기고 denied)
// - confirm_shipment: 출력한 송장 바코드 스캔 → 출고 확정. 마지막 줄이면 선물함이 끝난다
// - returns / confirm_return: 결제가 없어 착불 반송 중인 선물함 목록(큰 상자 원 송장번호) · 반송 송장번호를 넣어 반송됨(Q16)
// 운영자가 아니면 404. 상태를 고르는 칸은 없다(INV-GB1).

export type BoxLabelOutcome =
  | { kind: "printed"; waybill: string | null; reprint: boolean; label: { recipientName: string; phone: string; zipCode: string; address1: string; address2: string } }
  | { kind: "denied"; reason: AccessDenyReason }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "no_address" }
  | { kind: "failed" };

export type ShipGiftBoxDeps = {
  /** 로그인한 사람의 세션 클라이언트 — DB 가 그 토큰의 사람으로 운영자·대표를 판정한다 */
  client: Pick<SupabaseClient, "rpc">;
  /** 송장 출력 함수 — 그 신청의 팬 주소를 연다(revgift-box INV-GB20). 바코드(GB…)를 그대로 넘긴다 */
  printLabel: (label: string) => Promise<BoxLabelOutcome>;
};

const FAILED = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
export const SHIP_MESSAGE = {
  shape: "입력한 값의 형식이 맞지 않아요.",
  notFound: "그 번호의 신청이 없어요. 바코드를 다시 스캔해 주세요.",
  ownerOnly: "송장 출력은 대표만 할 수 있어요.",
  waybillOwnerOnly: "운송장 번호는 대표만 넣을 수 있어요.",
  notNow: "지금 단계에서 할 수 없어요. 신청을 다시 불러와 주세요.",
  wrongWaybill: "이 신청의 송장이 아니에요.",
  signIn: "로그인을 다시 확인해 주세요.",
  notReturning: "착불 반송 중인 선물함이 아니에요. 목록을 새로고침해 주세요.",
} as const;
const DENY_MESSAGE: Record<Exclude<AccessDenyReason, "not_owner">, string> = {
  no_valid_approval: "이 신청에 받을 주소가 없어 송장을 출력할 수 없어요.",
  order_mismatch: "주소 주인이 이 신청의 팬과 맞지 않아 송장에 쓰지 않았어요. 개발 담당에게 알려 주세요.",
  order_not_printable: "결제가 끝난 신청만 송장을 출력할 수 있어요.",
  difference_unpaid: "결제가 끝난 신청만 송장을 출력할 수 있어요.",
  decrypt_limit_reached: "이 신청의 송장 출력 횟수(다시 출력 포함 3번)를 다 썼어요.",
  address_mismatch: "주소 주인이 맞지 않아 송장에 쓰지 않았어요. 개발 담당에게 알려 주세요.",
};

const label = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .pipe(z.string().regex(/^GB[0-9]{8,12}$/));
const waybill = z.string().max(40);

const bodyShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lookup"), label }).strict(),
  z.object({ kind: z.literal("print"), label }).strict(),
  z.object({ kind: z.literal("set_waybill"), label, waybill }).strict(),
  z.object({ kind: z.literal("confirm_shipment"), label, waybill }).strict(),
  z.object({ kind: z.literal("returns") }).strict(),
  z.object({ kind: z.literal("confirm_return"), boxId: z.string().uuid(), waybill }).strict(),
]);

export type ShipGiftBoxWrite = z.input<typeof bodyShape>;

const lookupReply = z
  .object({
    label: z.string(),
    nickname: z.string(),
    box_name: z.string(),
    box_status: boxStatusSchema,
    status: applicationStatusSchema,
    printed: z.boolean(),
    waybill: z.string().nullable(),
    shipped: z.boolean(),
    region_mismatch: z.boolean(),
    tier: z.enum(INVOICE_TIERS).nullable(),
  })
  .strict();
const returnsReply = z.array(
  z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      creator_name: z.string(),
      returning_at: z.string().nullable(),
      // unpaid 명세서 결제 없음(INV-GB19) · all_missing 모든 신청이 도착 안 함, 명세서 없음(INV-GB11 · Q12)
      reason: z.enum(RETURN_REASONS),
      carton_waybills: z.array(z.string()),
    })
    .strict(),
);

function errorReply(code: string | undefined, conflict: string = SHIP_MESSAGE.notNow): JsonReply {
  if (code === "42501") return { status: 403, body: { message: MESSAGE_FORBIDDEN } };
  if (code === "22023") return { status: 400, body: { message: SHIP_MESSAGE.shape } };
  if (code === "P0002") return { status: 404, body: { message: SHIP_MESSAGE.notFound } };
  if (code === "55000" || code === "P0022") return { status: 409, body: { message: conflict } };
  if (code === "P0043") return { status: 409, body: { message: SHIP_MESSAGE.wrongWaybill } };
  return { status: 500, body: { message: FAILED } };
}

export async function shipGiftBox(deps: ShipGiftBoxDeps, body: unknown): Promise<JsonReply> {
  const { client } = deps;
  const access = await readAdminAccess(client);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: SHIP_MESSAGE.shape } };
  const input = shaped.data;

  switch (input.kind) {
    case "lookup": {
      const { data, error } = await client.rpc("office_gift_box_outbound_lookup", { p_label: input.label });
      if (error) return errorReply(error.code);
      const r = lookupReply.safeParse(data);
      if (!r.success) return { status: 500, body: { message: FAILED } };
      const v = r.data;
      return {
        status: 200,
        body: {
          application: {
            label: v.label,
            nickname: v.nickname,
            boxName: v.box_name,
            boxStatus: v.box_status,
            status: v.status,
            printed: v.printed,
            waybill: v.waybill,
            shipped: v.shipped,
            regionMismatch: v.region_mismatch,
            tier: v.tier,
          },
        },
      };
    }

    case "print": {
      // 직원의 시도도 송장 출력 함수가 판정하고 거부 줄을 남긴다. 그 함수가 어떤 답을 하든 직원에게는 라벨을 내주지 않는다(두 겹)
      const printed = await deps.printLabel(input.label);
      if (access !== "owner") return { status: 403, body: { message: SHIP_MESSAGE.ownerOnly } };
      switch (printed.kind) {
        case "printed":
          return { status: 200, body: { waybill: printed.waybill, reprint: printed.reprint, label: printed.label } };
        case "denied":
          if (printed.reason === "not_owner") return { status: 403, body: { message: SHIP_MESSAGE.ownerOnly } };
          return { status: 409, body: { message: DENY_MESSAGE[printed.reason], reason: "not_shippable" } };
        case "no_address":
          return { status: 409, body: { message: DENY_MESSAGE.no_valid_approval, reason: "not_shippable" } };
        case "unauthenticated":
          return { status: 401, body: { message: SHIP_MESSAGE.signIn } };
        case "not_found":
          return { status: 404, body: { message: SHIP_MESSAGE.notFound } };
        case "failed":
          return { status: 500, body: { message: FAILED } };
      }
      return { status: 500, body: { message: FAILED } };
    }

    case "set_waybill": {
      const parsed = parseWaybillInput(input.waybill);
      if (!parsed.ok) return { status: 400, body: { message: parsed.message } };
      const { data, error } = await client.rpc("office_gift_box_set_waybill", { p_label: input.label, p_waybill: parsed.value });
      if (error) return errorReply(error.code);
      if (data === "denied") return { status: 403, body: { message: SHIP_MESSAGE.waybillOwnerOnly } };
      if (data !== "saved") return { status: 500, body: { message: FAILED } };
      return { status: 200, body: { ok: true } };
    }

    case "confirm_shipment": {
      const parsed = parseWaybillInput(input.waybill);
      if (!parsed.ok) return { status: 400, body: { message: parsed.message } };
      const { error } = await client.rpc("office_gift_box_confirm_shipment", { p_label: input.label, p_waybill: parsed.value });
      if (error) return errorReply(error.code);
      return { status: 200, body: { ok: true } };
    }

    case "returns": {
      const { data, error } = await client.rpc("office_gift_box_returns");
      if (error) return errorReply(error.code);
      const r = returnsReply.safeParse(data);
      if (!r.success) return { status: 500, body: { message: FAILED } };
      return {
        status: 200,
        body: { boxes: r.data.map((b) => ({ id: b.id, name: b.name, creatorName: b.creator_name, returningAt: b.returning_at, reason: b.reason, cartonWaybills: b.carton_waybills })) },
      };
    }

    case "confirm_return": {
      const parsed = parseWaybillInput(input.waybill);
      if (!parsed.ok) return { status: 400, body: { message: parsed.message } };
      const { error } = await client.rpc("office_gift_box_confirm_return", { p_box_id: input.boxId, p_waybill: parsed.value });
      if (error) return errorReply(error.code, SHIP_MESSAGE.notReturning);
      return { status: 200, body: { ok: true } };
    }
  }
}
