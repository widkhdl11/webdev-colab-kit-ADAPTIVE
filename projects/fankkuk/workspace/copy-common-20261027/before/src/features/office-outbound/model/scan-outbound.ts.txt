import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AccessDenyReason } from "@/entities/address/model/access-log";
import type { CreatorAddressLabel } from "@/entities/address/model/creator-address-plaintext";
import { lookupParcelReply } from "@/entities/parcel/api/lookup-parcel";
import { officeErrorReply } from "@/entities/parcel/model/office-error";
import { qrCode, waybillNo } from "@/entities/parcel/model/scan-code";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";
import { MESSAGE_POLICE_MEMO, POLICE_MEMO_MAX } from "./police-memo";

// 출고 화면의 서버 쪽 (office-workflow INV-W1·W2·W3·W8).
// - lookup: 라벨 QR 로 상자를 불러온다(그 상자가 지금 할 수 있는 일만 화면에 나온다)
// - print_label: 송장 출력(주소 열기 1회) — 대표만(INV-W3, address-protection INV-P8). 직원이 눌러도 송장 출력 함수까지 보낸다 —
//   그 함수가 대표가 아니라고 거부하며 거부 줄을 남긴다 — 그 줄은 운영자 내부 기록(D12)에만 보인다(INV-P7). 직원에게는 어떤 결과든 라벨을 내주지 않는다.
//   송장 출력 함수(printLabel)가 상자 종류대로 주소를 열고(팬 선물은 크리에이터 주소, 역조공은 팬 주소 — reverse-gift INV-R7)
//   출력 단계까지 넘긴다. 앱 서버는 그 결과(라벨 칸)를 화면에 넘기기만 한다. 주소 없이 출력 단계로 넘기던 옛 DB 함수(office_print_label)는
//   지웠다(20261009000003) — 출력 단계로 가는 길은 주소를 여는 그 함수뿐이다.
// - confirm_shipment: 출력한 송장 바코드 스캔 → 출고 확정(+ 봉투 파쇄 기록, DB 가 같이 남긴다)
// - print_return: 반송 송장 출력 — 운영자 누구나. 봉투 번호는 DB 가 그 상자 것만 돌려준다(INV-W8)
// - confirm_return: 반송 송장 바코드 스캔 → 반송 확정(+ 봉투 파쇄 기록)
// - record_disposal: 처분 대상 상자 처분 기록(INV-W15) · record_police_handover: 신고 보관 상자 경찰 인계 기록(INV-W14, 메모 1~200자)
// 출력 송장번호는 서버가 만든다 — 화면이 보내는 송장번호·봉투 번호는 strict 라 400.

export type OutboundDeps = {
  /** 로그인한 사람의 세션 클라이언트 — DB 가 그 토큰의 사람으로 운영자·대표를 판정한다. 관리자 키를 쓰면 이 판정이 사라진다 */
  client: Pick<SupabaseClient, "rpc">;
  /** 새 송장번호. 지금은 개발용 난수(dev-waybill) — 택배사 API 가 붙으면 그 API 가 준 번호로 바뀐다 */
  newWaybill: () => string;
  /** 송장 출력 함수 — 그 상자의 받는 사람 주소를 연다(팬 선물 address-protection INV-P4, 역조공 reverse-gift INV-R7) */
  printLabel: (qr: string) => Promise<LabelOutcome>;
  /** 반송 송장 출력 함수 — 주문에 이어진 상자는 보낸 사람이 확인한 주소를 연다(address-protection INV-P18). 이어지지 않은 상자면 not_linked */
  printReturnLabel: (qr: string) => Promise<ReturnLabelOutcome>;
};

export type ReturnLabelOutcome =
  | { kind: "printed"; waybill: string; reprint: boolean; label: CreatorAddressLabel }
  | { kind: "denied"; reason: AccessDenyReason }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "not_linked" }
  | { kind: "failed" };

export type LabelOutcome =
  | { kind: "printed"; waybill: string; reprint: boolean; label: CreatorAddressLabel }
  | { kind: "denied"; reason: AccessDenyReason }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "no_address" }
  | { kind: "failed" };

// 송장 출력 함수의 거부 → 화면 문구. 409 + not_shippable 이라 화면이 상자를 다시 읽는다. 팬 선물·역조공 둘 다에 맞는 말로 쓴다.
const DENY_MESSAGE: Record<Exclude<AccessDenyReason, "not_owner">, string> = {
  no_valid_approval: "승인이 확인되지 않아 주소를 열지 않았어요(팬 선물은 크리에이터 승인 서명, 역조공은 팬의 받기).",
  order_mismatch: "주문번호가 이 상자의 주문과 맞지 않아 주소를 열지 않았어요.",
  order_not_printable: "지금은 송장을 출력할 수 없는 단계예요.",
  difference_unpaid: "차액이 결제되지 않아 송장을 출력할 수 없어요.",
  decrypt_limit_reached: "이 상자의 송장 출력 횟수(다시 출력 포함 3번)를 다 썼어요.",
  address_mismatch: "주소 주인이 맞지 않아 송장에 쓰지 않았어요. 개발 담당에게 알려 주세요.",
};
// 반송 송장 출력 함수의 거부 → 화면 문구(INV-W15·P18). 확인 전 상자는 보낸 사람이 반송 주소를 확인해야 출력된다
const RETURN_DENY_MESSAGE: Record<Exclude<AccessDenyReason, "not_owner">, string> = {
  no_valid_approval: "반송 주소 확인 전이라 주소를 열지 않았어요. 보낸 사람이 확인하면 출력할 수 있어요.",
  order_mismatch: "주문번호가 이 상자의 주문과 맞지 않아 주소를 열지 않았어요.",
  order_not_printable: "지금은 반송 송장을 출력할 수 없는 단계예요.",
  difference_unpaid: "지금은 반송 송장을 출력할 수 없는 단계예요.",
  decrypt_limit_reached: "이 상자의 반송 송장 출력 횟수(다시 출력 포함 3번)를 다 썼어요.",
  address_mismatch: "주소 주인이 맞지 않아 송장에 쓰지 않았어요. 개발 담당에게 알려 주세요.",
};
const MESSAGE_NO_ADDRESS = "크리에이터가 아직 배송 주소를 등록하지 않았어요.";
const MESSAGE_SIGN_IN = "로그인을 다시 확인해 주세요.";

const MESSAGE_SHAPE = "스캔한 값의 형식이 맞지 않아요. 다시 스캔해 주세요.";
const MESSAGE_OWNER_ONLY = "송장 출력은 대표만 할 수 있어요.";
const FAILED = "처리하지 못했어요. 잠시 뒤 다시 해 주세요.";
const MESSAGES = { limit: MESSAGE_SHAPE, failed: FAILED };



const bodyShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lookup"), qr: qrCode }).strict(),
  z.object({ kind: z.literal("print_label"), qr: qrCode }).strict(),
  z.object({ kind: z.literal("confirm_shipment"), qr: qrCode, waybill: waybillNo }).strict(),
  z.object({ kind: z.literal("print_return"), qr: qrCode }).strict(),
  z.object({ kind: z.literal("confirm_return"), qr: qrCode, waybill: waybillNo }).strict(),
  z.object({ kind: z.literal("record_disposal"), qr: qrCode }).strict(),
  z.object({ kind: z.literal("record_police_handover"), qr: qrCode, memo: z.string() }).strict(),
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
      // INV-P7: 직원의 시도도 송장 출력 함수가 판정하고 거부 줄을 남긴다(그 함수가 자기 설정의 대표 ID 로 본다 — INV-P8).
      const printed = await deps.printLabel(input.qr);
      // INV-W3: 그 함수가 어떤 답을 하든 직원에게는 라벨을 내주지 않는다(두 겹)
      if (access !== "owner") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
      switch (printed.kind) {
        case "printed":
          // 라벨 다섯 칸만 — 응답은 캐시하지 않는다(private-json 의 no-store)
          return { status: 200, body: { waybill: printed.waybill, reprint: printed.reprint, label: printed.label } };
        case "denied":
          if (printed.reason === "not_owner") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
          return { status: 409, body: { message: DENY_MESSAGE[printed.reason], reason: "not_shippable" } };
        case "no_address":
          return { status: 409, body: { message: MESSAGE_NO_ADDRESS, reason: "not_shippable" } };
        case "unauthenticated":
          return { status: 401, body: { message: MESSAGE_SIGN_IN } };
        case "not_found":
          return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
        case "failed":
          return { status: 500, body: { message: FAILED } };
      }
    }

    case "print_return": {
      // INV-W8·W15·P18: 주문에 이어진 상자는 반송 송장 출력 함수가 보낸 사람이 확인한 주소를 열어 출력 단계까지 넘긴다(대표만 — 직원의 시도도 그 함수가 거부 줄을 남긴다).
      // 어느 주문에도 이어지지 않은 상자(not_linked)만 지금처럼 봉투 번호 길로 간다(S15f).
      const back = await deps.printReturnLabel(input.qr);
      if (back.kind !== "not_linked") {
        if (access !== "owner") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
        switch (back.kind) {
          case "printed":
            return { status: 200, body: { waybill: back.waybill, reprint: back.reprint, label: back.label } };
          case "denied":
            if (back.reason === "not_owner") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
            return { status: 409, body: { message: RETURN_DENY_MESSAGE[back.reason], reason: "not_shippable" } };
          case "unauthenticated":
            return { status: 401, body: { message: MESSAGE_SIGN_IN } };
          case "not_found":
            return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
          case "failed":
            return { status: 500, body: { message: FAILED } };
        }
      }
      const waybill = deps.newWaybill();
      const { data, error } = await client.rpc("office_print_return_label", { p_qr: input.qr, p_waybill: waybill });
      if (error) return officeErrorReply(error.code, MESSAGES);
      if (typeof data !== "string" || data === "") return { status: 500, body: { message: FAILED } };
      return { status: 200, body: { waybill, envelopeNo: data } };
    }

    case "record_disposal": {
      // INV-W15: 처분 대상 상자의 QR 스캔 → 처분 기록(봉투 파쇄 기록을 DB 가 같이 남긴다). 운영자 누구나
      const { error } = await client.rpc("office_record_disposal", { p_qr: input.qr });
      if (error) return officeErrorReply(error.code, MESSAGES);
      return { status: 200, body: { ok: true } };
    }

    case "record_police_handover": {
      // INV-W14: 신고 보관 상자의 QR 스캔 → 경찰 인계 기록(메모 1~200자, 봉투 파쇄 기록을 DB 가 같이 남긴다). 운영자 누구나
      const memo = input.memo.trim();
      if (charCount(memo) < 1 || charCount(memo) > POLICE_MEMO_MAX) return { status: 400, body: { message: MESSAGE_POLICE_MEMO } };
      const { error } = await client.rpc("office_record_police_handover", { p_qr: input.qr, p_memo: memo });
      if (error) return officeErrorReply(error.code, { limit: MESSAGE_POLICE_MEMO, failed: FAILED });
      return { status: 200, body: { ok: true } };
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
