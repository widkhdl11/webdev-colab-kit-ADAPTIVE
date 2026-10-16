import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CARRIERS } from "@/entities/parcel/model/carrier";
import { parseWaybillInput, WAYBILL_FORMAT_MESSAGE } from "@/entities/parcel/model/waybill-no";
import type { Viewer, ViewerRole } from "@/entities/session/model/viewer";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 상자 쓰기 — 팬 선물 상자 송장(set_box_waybill) · 역조공 몫 송장(set_share_waybill) · 받는 주소 없이 보냈어요(find_held_parcel)
// · 제가 보낸 게 아니에요(report_not_mine).
// 요청한 사람의 세션 클라이언트로 DB 함수를 부른다. 누구 상자인지·할 수 있는 때인지는 DB 가 로그인 토큰으로 판정한다.
// 여기서는 본문 꼴과 역할만 먼저 거른다 — 운영자는 어느 쪽도 쓰지 않는다(office-workflow INV-W5: 운영자가 손으로 잇는 길은 없다).
// 송장번호는 배송 조회용 선택 입력이다(inbound-address-code INV-C7) — 상자를 찾는 열쇠가 아니다. 계정마다 24시간에 10번까지(DB 판정, 429).
//   같은 번호가 다른 상자에 있어도 거부하지 않고 늘 같은 「등록됐어요」로 답한다 — 남의 송장번호가 등록돼 있는지 떠볼 수 없게.

export const MESSAGE_ALREADY_RECEIVED = "이미 입고된 상자예요";
export const MESSAGE_NO_MATCH = "맞는 상자를 못 찾았어요. 송장번호와 택배사를 다시 확인해 주세요. 사무실에 도착한 지 7일이 지나면 원래 송장 주소로 돌려보내요";
export const MESSAGE_MATCH_LIMIT = "오늘은 더 찾을 수 없어요. 내일 다시 해 주세요";
export const MESSAGE_WAYBILL_LIMIT = "오늘은 송장번호를 더 넣을 수 없어요. 내일 다시 해 주세요";
export const MESSAGE_FIND_DETAILS = "송장번호를 넣고 택배사를 골라 주세요.";
export const MESSAGE_NOT_MINE_LATE = "출고가 끝난 상자는 여기서 알릴 수 없어요. 고객센터로 문의해 주세요.";

/** 찾기 함수의 답. 남의 상자·두 값 중 하나라도 다름·닉네임이 맞지 않은 상자·기한 지남·남의 6자리가 붙은 상자는 모두 not_found 하나다(INV-C4·C10). */
const matchAnswer = z.enum(["matched", "not_found"]);

/**
 * 송장번호 등록 함수의 답. 계정마다 24시간에 10번(성공 포함)이라 DB 가 시도를 먼저 기록하고, 실패도 오류가 아니라 값으로 돌려준다
 * (오류로 내면 시도 기록까지 되돌려진다). 같은 번호가 다른 상자에 있어도 saved 하나다(INV-C7).
 */
const waybillAnswer = z.enum(["saved", "not_found", "already_received"]);

const FAILED = "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";

const waybillField = z.string().max(40);
const boxBody = z.object({ boxId: z.guid(), waybill: waybillField }).strict();
const shareBody = z.object({ shareId: z.guid(), waybill: waybillField }).strict();

// 이름 칸은 없다 — 팬 상자는 DB 가 보류 상자의 닉네임 일치 계정과 로그인 계정을 맞대 본다(INV-C4 ②-가), 역조공 몫은 두 값뿐(②-나)
const findCommon = { waybill: waybillField, carrier: z.enum(CARRIERS) };
const findBody = z.union([
  z.object({ boxId: z.guid(), ...findCommon }).strict(),
  z.object({ shareId: z.guid(), ...findCommon }).strict(),
]);
const notMineBody = z.union([z.object({ boxId: z.guid() }).strict(), z.object({ shareId: z.guid() }).strict()]);

export type BoxWaybillWrite = z.input<typeof boxBody>;
export type ShareWaybillWrite = z.input<typeof shareBody>;
export type FindHeldWrite = z.input<typeof findBody>;
export type NotMineWrite = z.input<typeof notMineBody>;

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

const BAD_REQUEST: JsonReply = { status: 400, body: { message: "잘못된 요청이에요." } };

function roleRefusal(viewer: Viewer | null, allowed: (role: ViewerRole) => boolean): JsonReply | null {
  if (!viewer) return { status: 401, body: { message: "로그인이 필요해요." } };
  if (!allowed(viewer.role)) return { status: 403, body: { message: "권한이 없어요." } };
  return null;
}

function waybillErrorReply(code: string | undefined, notFound: string): JsonReply {
  if (code === "P0002") return { status: 404, body: { message: notFound } };
  if (code === "P0045") return { status: 429, body: { message: MESSAGE_WAYBILL_LIMIT } };
  return pgErrorReply(code, { limit: WAYBILL_FORMAT_MESSAGE, conflict: MESSAGE_ALREADY_RECEIVED, failed: FAILED });
}

/** 등록 함수의 답 → 응답. 모르는 답이면 500(서버 쪽 꼴이 어긋남 — 저장 여부를 단정하지 않는다). */
function waybillReply(data: unknown, waybill: string): JsonReply {
  const answer = waybillAnswer.safeParse(data);
  if (!answer.success) return { status: 500, body: { message: FAILED } };
  if (answer.data === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (answer.data === "already_received") return { status: 409, body: { message: MESSAGE_ALREADY_RECEIVED } };
  return { status: 200, body: { waybill } };
}

/** 꼴 검사 → 숫자만 남긴 번호. 틀리면 DB 를 부르지 않는다. */
function shapeWaybill(raw: string): { ok: true; value: string } | { ok: false; reply: JsonReply } {
  const parsed = parseWaybillInput(raw);
  return parsed.ok ? parsed : { ok: false, reply: { status: 400, body: { message: WAYBILL_FORMAT_MESSAGE } } };
}

const isSender = (role: ViewerRole) => role === "fan" || role === "creator";

/** 팬 선물 상자 하나의 원 송장번호. 보낸 사람(팬·크리에이터) 본인의 결제 완료 상자, 입고 전까지만(DB 판정). */
export async function saveBoxWaybill(deps: Deps, body: unknown): Promise<JsonReply> {
  const refused = roleRefusal(deps.viewer, isSender);
  if (refused) return refused;
  const shaped = boxBody.safeParse(body);
  if (!shaped.success) return BAD_REQUEST;
  const no = shapeWaybill(shaped.data.waybill);
  if (!no.ok) return no.reply;
  const { data, error } = await deps.client.rpc("set_box_waybill", { p_box_id: shaped.data.boxId, p_waybill: no.value });
  if (error) return waybillErrorReply(error.code, MESSAGE_NOT_FOUND);
  return waybillReply(data, no.value);
}

/** 역조공 몫 하나의 원 송장번호. 그 몫을 보낸 크리에이터만, 입고 전까지만(DB 판정). */
export async function saveShareWaybill(deps: Deps, body: unknown): Promise<JsonReply> {
  const refused = roleRefusal(deps.viewer, (role) => role === "creator");
  if (refused) return refused;
  const shaped = shareBody.safeParse(body);
  if (!shaped.success) return BAD_REQUEST;
  const no = shapeWaybill(shaped.data.waybill);
  if (!no.ok) return no.reply;
  const { data, error } = await deps.client.rpc("set_share_waybill", { p_share_id: shaped.data.shareId, p_waybill: no.value });
  if (error) return waybillErrorReply(error.code, MESSAGE_NOT_FOUND);
  return waybillReply(data, no.value);
}

/** 팬 선물 상자는 보낸 사람(팬·크리에이터), 역조공 몫은 보낸 크리에이터만 */
function unitRole(body: { boxId?: unknown; shareId?: unknown }): (role: ViewerRole) => boolean {
  return "shareId" in body ? (role) => role === "creator" : isSender;
}

/**
 * inbound-address-code INV-C4 ②·C10 「받는 주소 없이 보냈어요」 — 주문 주인이 고른 내 상자 하나 + 송장번호·택배사.
 * 두 값이 맞고, 팬 상자면 그 보류 상자가 입고 때 로그인한 팬의 닉네임과 맞았을 때 DB 가 그 상자를 내 상자로 잇는다(②-가, 카드 d94).
 * 이유(남의 상자·두 값 중 하나 다름·닉네임 다름·기한 지남)는 나누지 않고 not_found 하나.
 * 계정마다 하루 5번까지 — 넘으면 DB 가 막는다(P0045). 주문번호는 받지 않는다(strict).
 */
export async function findHeldParcel(deps: Deps, body: unknown): Promise<JsonReply> {
  if (!deps.viewer) return { status: 401, body: { message: "로그인이 필요해요." } };
  const shaped = findBody.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_FIND_DETAILS } };
  const input = shaped.data;
  const refused = roleRefusal(deps.viewer, unitRole(input));
  if (refused) return refused;
  const no = shapeWaybill(input.waybill);
  if (!no.ok) return no.reply;
  const { data, error } = await deps.client.rpc("find_held_parcel", {
    p_box_id: "boxId" in input ? input.boxId : null,
    p_share_id: "shareId" in input ? input.shareId : null,
    p_waybill: no.value,
    p_carrier: input.carrier,
  });
  if (error?.code === "P0045") return { status: 429, body: { message: MESSAGE_MATCH_LIMIT } };
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_FIND_DETAILS, failed: "찾지 못했어요. 잠시 뒤 다시 해 주세요." });
  const answer = matchAnswer.safeParse(data);
  // 모르는 답이면 500 — 입고 화면(scan-inbound)과 같은 꼴. 이어졌는지 단정하지 않는다
  if (!answer.success) return { status: 500, body: { message: "찾지 못했어요. 잠시 뒤 다시 해 주세요." } };
  // 못 찾은 것은 오류가 아니라 찾기의 결과다 — 200 으로 돌려주고 화면이 결과 칸에 보여 준다
  return answer.data === "matched"
    ? { status: 200, body: { matched: true } }
    : { status: 200, body: { matched: false, message: MESSAGE_NO_MATCH } };
}

/**
 * inbound-address-code INV-C8 「제가 보낸 게 아니에요」 — 주문 주인이 입고된 내 상자 하나를 보류로 돌린다(출고 목록에서 빠짐, 운영자 확인).
 * 누구 상자인지·출고 전인지는 DB 가 본다. 남의 상자·입고 전은 404, 출고 확정 뒤는 409. 누른 기록은 지울 수 없다.
 */
export async function reportNotMine(deps: Deps, body: unknown): Promise<JsonReply> {
  if (!deps.viewer) return { status: 401, body: { message: "로그인이 필요해요." } };
  const shaped = notMineBody.safeParse(body);
  if (!shaped.success) return BAD_REQUEST;
  const input = shaped.data;
  const refused = roleRefusal(deps.viewer, unitRole(input));
  if (refused) return refused;
  const { error } = await deps.client.rpc("report_not_mine", {
    p_box_id: "boxId" in input ? input.boxId : null,
    p_share_id: "shareId" in input ? input.shareId : null,
  });
  if (error) return pgErrorReply(error.code, { limit: "잘못된 요청이에요.", conflict: MESSAGE_NOT_MINE_LATE, failed: "알리지 못했어요. 잠시 뒤 다시 해 주세요." });
  return { status: 200, body: { reported: true } };
}
