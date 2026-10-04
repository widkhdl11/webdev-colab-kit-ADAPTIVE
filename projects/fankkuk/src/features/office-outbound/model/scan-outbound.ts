import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { lookupParcelReply } from "@/entities/parcel/api/lookup-parcel";
import { officeErrorReply } from "@/entities/parcel/model/office-error";
import { qrCode, waybillNo } from "@/entities/parcel/model/scan-code";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 출고 화면의 서버 쪽 (office-workflow INV-W1·W2·W3·W8).
// - lookup: 라벨 QR 로 상자를 불러온다(그 상자가 지금 할 수 있는 일만 화면에 나온다)
// - print_label: 송장 출력(주소 열기 1회) — 대표만(INV-W3, address-protection INV-P8). 직원이면 DB 를 부르지 않고 403
// - confirm_shipment: 출력한 송장 바코드 스캔 → 출고 확정(+ 봉투 파쇄 기록, DB 가 같이 남긴다)
// - print_return: 반송 송장 출력 — 운영자 누구나. 봉투 번호는 DB 가 그 상자 것만 돌려준다(INV-W8)
// - confirm_return: 반송 송장 바코드 스캔 → 반송 확정(+ 봉투 파쇄 기록)
// 출력 송장번호는 서버가 만든다 — 화면이 보내는 송장번호·봉투 번호는 strict 라 400.

export type OutboundDeps = {
  /** 로그인한 사람의 세션 클라이언트 — DB 가 그 토큰의 사람으로 운영자·대표를 판정한다. 관리자 키를 쓰면 이 판정이 사라진다 */
  client: Pick<SupabaseClient, "rpc">;
  /** 새 송장번호. 지금은 개발용 난수(dev-waybill) — 택배사 API 가 붙으면 그 API 가 준 번호로 바뀐다 */
  newWaybill: () => string;
};

const MESSAGE_SHAPE = "스캔한 값의 꼴이 맞지 않아요. 다시 스캔해 주세요.";
const MESSAGE_OWNER_ONLY = "송장 출력은 대표만 할 수 있어요.";
const FAILED = "처리하지 못했어요. 잠시 뒤 다시 해 주세요.";
const MESSAGES = { limit: MESSAGE_SHAPE, failed: FAILED };

const bodyShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lookup"), qr: qrCode }).strict(),
  z.object({ kind: z.literal("print_label"), qr: qrCode }).strict(),
  z.object({ kind: z.literal("confirm_shipment"), qr: qrCode, waybill: waybillNo }).strict(),
  z.object({ kind: z.literal("print_return"), qr: qrCode }).strict(),
  z.object({ kind: z.literal("confirm_return"), qr: qrCode, waybill: waybillNo }).strict(),
]);

export type OutboundWrite = z.input<typeof bodyShape>;

export async function scanOutbound(deps: OutboundDeps, body: unknown): Promise<JsonReply> {
  const { client } = deps;
  const access = await readAdminAccess(client);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_SHAPE } };
  const input = shaped.data;

  switch (input.kind) {
    case "lookup":
      return lookupParcelReply(client, input.qr);

    case "print_label": {
      // INV-W3: 직원은 DB 까지 가지 않는다(DB 도 대표만 받는다 — 42501)
      if (access !== "owner") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
      const waybill = deps.newWaybill();
      const { error } = await client.rpc("office_print_label", { p_qr: input.qr, p_waybill: waybill });
      if (error) return officeErrorReply(error.code, MESSAGES);
      return { status: 200, body: { waybill } };
    }

    case "print_return": {
      const waybill = deps.newWaybill();
      const { data, error } = await client.rpc("office_print_return_label", { p_qr: input.qr, p_waybill: waybill });
      if (error) return officeErrorReply(error.code, MESSAGES);
      if (typeof data !== "string" || data === "") return { status: 500, body: { message: FAILED } };
      return { status: 200, body: { waybill, envelopeNo: data } };
    }

    case "confirm_shipment":
    case "confirm_return": {
      const fn = input.kind === "confirm_shipment" ? "office_confirm_shipment" : "office_confirm_return";
      const { error } = await client.rpc(fn, { p_qr: input.qr, p_waybill: input.waybill });
      if (error) return officeErrorReply(error.code, MESSAGES);
      return { status: 200, body: { ok: true } };
    }
  }
}
