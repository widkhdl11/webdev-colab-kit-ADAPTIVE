import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseWaybillInput, WAYBILL_FORMAT_MESSAGE } from "@/entities/parcel/model/waybill-no";
import type { Viewer, ViewerRole } from "@/entities/session/model/viewer";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 상자 원 송장번호 쓰기 세 가지 — 팬 선물 상자 송장(set_box_waybill) · 역조공 몫 송장(set_share_waybill) · 내 물건 찾기(match_unmatched).
// 요청한 사람의 세션 클라이언트로 DB 함수를 부른다. 누구 상자인지·고칠 수 있는 때인지는 DB 가 로그인 토큰으로 판정한다.
// 여기서는 본문 꼴과 역할만 먼저 거른다 — 운영자는 어느 쪽도 쓰지 않는다(office-workflow INV-W5: 운영자가 손으로 잇는 길은 없다).

export const MESSAGE_ALREADY_RECEIVED = "이미 입고된 상자예요";
// 다른 상자가 쓴 번호인지 알려 주지 않는다 — 남의 송장번호가 등록돼 있는지 떠볼 수 없게
export const MESSAGE_WAYBILL_TAKEN = "등록할 수 없는 송장번호예요. 번호를 다시 확인해 주세요";
export const MESSAGE_NO_MATCH = "맞는 상자를 못 찾았어요. 사무실에 도착한 지 7일이 지나면 원 송장 주소로 돌려보내요";
export const MESSAGE_MATCH_LIMIT = "오늘은 더 찾을 수 없어요. 내일 다시 해 주세요";

/** 매칭 함수의 답. 남의 상자·맞는 미확인 없음·기한 지남은 모두 not_found 하나다(INV-W5). */
const matchAnswer = z.enum(["matched", "not_found"]);

const FAILED = "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";

const waybillField = z.string().max(40);
const boxBody = z.object({ boxId: z.guid(), waybill: waybillField }).strict();
const shareBody = z.object({ shareId: z.guid(), waybill: waybillField }).strict();

export type BoxWaybillWrite = z.input<typeof boxBody>;
export type ShareWaybillWrite = z.input<typeof shareBody>;

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

const BAD_REQUEST: JsonReply = { status: 400, body: { message: "잘못된 요청이에요." } };

function roleRefusal(viewer: Viewer | null, allowed: (role: ViewerRole) => boolean): JsonReply | null {
  if (!viewer) return { status: 401, body: { message: "로그인이 필요해요." } };
  if (!allowed(viewer.role)) return { status: 403, body: { message: "권한이 없어요." } };
  return null;
}

function waybillErrorReply(code: string | undefined, notFound: string): JsonReply {
  if (code === "23505") return { status: 409, body: { message: MESSAGE_WAYBILL_TAKEN } };
  if (code === "P0002") return { status: 404, body: { message: notFound } };
  return pgErrorReply(code, { limit: WAYBILL_FORMAT_MESSAGE, conflict: MESSAGE_ALREADY_RECEIVED, failed: FAILED });
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
  const { error } = await deps.client.rpc("set_box_waybill", { p_box_id: shaped.data.boxId, p_waybill: no.value });
  if (error) return waybillErrorReply(error.code, MESSAGE_NOT_FOUND);
  return { status: 200, body: { waybill: no.value } };
}

/** 역조공 몫 하나의 원 송장번호. 그 몫을 보낸 크리에이터만, 입고 전까지만(DB 판정). */
export async function saveShareWaybill(deps: Deps, body: unknown): Promise<JsonReply> {
  const refused = roleRefusal(deps.viewer, (role) => role === "creator");
  if (refused) return refused;
  const shaped = shareBody.safeParse(body);
  if (!shaped.success) return BAD_REQUEST;
  const no = shapeWaybill(shaped.data.waybill);
  if (!no.ok) return no.reply;
  const { error } = await deps.client.rpc("set_share_waybill", { p_share_id: shaped.data.shareId, p_waybill: no.value });
  if (error) return waybillErrorReply(error.code, MESSAGE_NOT_FOUND);
  return { status: 200, body: { waybill: no.value } };
}

/**
 * INV-W5 내 물건 찾기 — 팬이 고른 내 상자 + 원 송장번호가 미확인 입고와 맞으면 이어진다.
 * 이어도 되는지(내 결제 완료 상자인지, 그 송장의 미확인 입고가 있는지)는 DB 매칭 함수가 본인 토큰으로만 판정한다.
 * 맞는 것이 없으면 DB 가 이유(남의 상자·아직 안 옴·기한 지남)를 나누지 않고 not_found 하나로 답한다.
 */
export async function matchMyBox(deps: Deps, body: unknown): Promise<JsonReply> {
  const refused = roleRefusal(deps.viewer, isSender);
  if (refused) return refused;
  const shaped = boxBody.safeParse(body);
  if (!shaped.success) return BAD_REQUEST;
  const no = shapeWaybill(shaped.data.waybill);
  if (!no.ok) return no.reply;
  const { data, error } = await deps.client.rpc("match_unmatched", { p_box_id: shaped.data.boxId, p_waybill: no.value });
  // 하루(24시간) 실패 10번을 넘으면 DB 가 막는다 — 송장번호를 바꿔 가며 남의 상자를 떠보지 못하게
  if (error?.code === "P0045") return { status: 429, body: { message: MESSAGE_MATCH_LIMIT } };
  if (error) return waybillErrorReply(error.code, MESSAGE_NOT_FOUND);
  const answer = matchAnswer.safeParse(data);
  if (!answer.success) throw new Error("내 물건 찾기: 매칭 함수가 모르는 답을 돌려줬다");
  // 못 찾은 것은 오류가 아니라 찾기의 결과다 — 200 으로 돌려주고 화면이 결과 칸에 보여 준다
  return answer.data === "matched"
    ? { status: 200, body: { matched: true } }
    : { status: 200, body: { matched: false, message: MESSAGE_NO_MATCH } };
}
