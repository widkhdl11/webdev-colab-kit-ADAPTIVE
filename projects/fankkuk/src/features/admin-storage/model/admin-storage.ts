import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CARRIERS } from "@/entities/parcel/model/carrier";
import { unmatchedFromRows } from "@/entities/parcel/model/office-lists";
import { PARCEL_TIERS } from "@/entities/parcel/model/office-parcel";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";

// 운영자 물품 보관소 (inbound-address-code INV-C13·C12 ③·C5, office-workflow INV-W5·W7 — 2026-10-21, 시안 v32 「확인 요청」 탭·「전화번호 뒤 4자리」 검색).
// 몸통의 kind 로 다섯을 가른다.
// - claims: 대기 중인 확인 요청 — 요청 시각·닉네임·입력한 송장번호·택배사·선택한 선물(주문번호)·보관 위치(선반·도착일·포장 모양).
// - accept: 「입고 처리」 — 「송장번호·내용물 확인함」 표시와 함께만(DB 도 다시 본다). INV-C12 의 잇기와 같은 끝(그 주문 상자로 입고·6자리 사용됨·운영자 기록).
// - reject: 「주인 아님」 — 대기만 풀린다. 상자는 목록에 그대로.
// - look: 포장 모양 수정(40자까지) — 수정 기록은 DB 가 추가만으로 남긴다.
// - phone_search: 전화번호 뒤 4자리(숫자 넷)로 대기 중인 보류 상자 좁히기 — 칸은 운영자 보류 목록과 같다. 검색 함수는 manual/0023(사람이 적용)에 있다.
// 운영자가 아니면 404. 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 관리자 키를 쓰면 DB 의 운영자 판정이 서버 계정 기준이 된다.

export const LOOK_MAX = 40;
export const MESSAGE_CLAIM_NOT_CANDIDATE = "선택한 선물이 이미 도착했거나 더는 받을 수 없는 상태예요. 회원에게 다시 확인해 주세요.";
export const MESSAGE_CLAIM_CLOSED = "이미 처리됐거나 반송 대기가 된 확인 요청이에요.";
export const MESSAGE_CLAIM_DISPUTE = "같은 송장번호가 다른 상자에 등록돼 있어요. 분쟁 상자라 여기서 처리하지 않아요.";
export const MESSAGE_LOOK_LENGTH = `포장 모양은 ${LOOK_MAX}자까지 적어 주세요.`;
export const MESSAGE_LOOK_CLOSED = "이미 입고됐거나 반송 대기가 된 상자예요.";
export const MESSAGE_PHONE_SEARCH = "전화번호 뒤 4자리를 숫자 4개로 적어 주세요.";
export const MESSAGE_PHONE_SEARCH_UNAVAILABLE = "전화번호 뒤 4자리 검색은 아직 쓸 수 없어요.";
const MESSAGE_ACCEPT_INPUT = "송장번호·내용물 확인을 표시해 주세요.";
const READ_FAILED = "목록을 읽지 못했어요. 잠시 뒤 다시 해 주세요.";
const FAILED = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

const claimRows = z.array(
  z
    .object({
      claim_id: z.string().uuid(),
      unmatched_id: z.string().uuid(),
      requested_at: z.string(),
      nickname: z.string(),
      waybill_no: z.string(),
      carrier: z.enum(CARRIERS),
      order_no: z.string(),
      box_label: z.string(),
      tier: z.enum(PARCEL_TIERS),
      shelf: z.string(),
      arrived_at: z.string(),
      look: z.string().nullable(),
    })
    .strict(),
);
const claimsBody = z.object({ kind: z.literal("claims") }).strict();
const acceptBody = z.object({ kind: z.literal("accept"), claimId: z.guid(), checked: z.literal(true) }).strict();
const rejectBody = z.object({ kind: z.literal("reject"), claimId: z.guid() }).strict();
const lookBody = z
  .object({
    kind: z.literal("look"),
    id: z.guid(),
    look: z
      .string()
      .max(80)
      .transform((s) => s.trim()),
  })
  .strict();
const phoneBody = z.object({ kind: z.literal("phone_search"), last4: z.string().regex(/^[0-9]{4}$/) }).strict();

export type StorageClaim = {
  claimId: string;
  unmatchedId: string;
  requestedAt: string;
  nickname: string;
  waybillNo: string;
  carrier: string;
  orderNo: string;
  boxLabel: string;
  tier: string;
  shelf: string;
  arrivedAt: string;
  look: string | null;
};

type Rpc = Pick<SupabaseClient, "rpc">;

function kindOf(body: unknown): unknown {
  return typeof body === "object" && body !== null ? (body as { kind?: unknown }).kind : undefined;
}

export async function adminStorageRequest(client: Rpc, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const kind = kindOf(body);
  if (kind === "claims") return readClaims(client, body);
  if (kind === "accept") return acceptClaim(client, body);
  if (kind === "reject") return rejectClaim(client, body);
  if (kind === "look") return setLook(client, body);
  if (kind === "phone_search") return searchPhoneLast4(client, body);
  return { status: 400, body: { message: "유효하지 않은 요청입니다." } };
}

async function readClaims(client: Rpc, body: unknown): Promise<JsonReply> {
  if (!claimsBody.safeParse(body).success) return { status: 400, body: { message: "유효하지 않은 요청입니다." } };
  const { data, error } = await client.rpc("admin_storage_claims");
  if (error) return pgErrorReply(error.code, { limit: READ_FAILED, failed: READ_FAILED });
  const rows = claimRows.safeParse(data ?? []);
  if (!rows.success) return { status: 500, body: { message: READ_FAILED } };
  const claims: StorageClaim[] = rows.data.map((r) => ({
    claimId: r.claim_id,
    unmatchedId: r.unmatched_id,
    requestedAt: r.requested_at,
    nickname: r.nickname,
    waybillNo: r.waybill_no,
    carrier: r.carrier,
    orderNo: r.order_no,
    boxLabel: r.box_label,
    tier: r.tier,
    shelf: r.shelf,
    arrivedAt: r.arrived_at,
    look: r.look,
  }));
  return { status: 200, body: { claims } };
}

async function acceptClaim(client: Rpc, body: unknown): Promise<JsonReply> {
  const shaped = acceptBody.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_ACCEPT_INPUT } };
  const { data, error } = await client.rpc("admin_accept_storage_claim", { p_claim_id: shaped.data.claimId, p_checked: shaped.data.checked });
  if (error?.code === "P0047") return { status: 409, body: { message: MESSAGE_CLAIM_NOT_CANDIDATE } };
  if (error?.code === "P0048") return { status: 409, body: { message: MESSAGE_CLAIM_DISPUTE } };
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_ACCEPT_INPUT, conflict: MESSAGE_CLAIM_CLOSED, failed: FAILED });
  // 모르는 답이면 입고됐다고 단정하지 않는다
  if (data !== "linked") return { status: 500, body: { message: FAILED } };
  return { status: 200, body: { ok: true } };
}

async function rejectClaim(client: Rpc, body: unknown): Promise<JsonReply> {
  const shaped = rejectBody.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: "유효하지 않은 요청입니다." } };
  const { error } = await client.rpc("admin_reject_storage_claim", { p_claim_id: shaped.data.claimId });
  if (error) return pgErrorReply(error.code, { limit: "유효하지 않은 요청입니다.", conflict: MESSAGE_CLAIM_CLOSED, failed: FAILED });
  return { status: 200, body: { ok: true } };
}

async function setLook(client: Rpc, body: unknown): Promise<JsonReply> {
  const shaped = lookBody.safeParse(body);
  if (!shaped.success || charCount(shaped.data.look) > LOOK_MAX) return { status: 400, body: { message: MESSAGE_LOOK_LENGTH } };
  const { error } = await client.rpc("admin_set_unmatched_look", { p_id: shaped.data.id, p_look: shaped.data.look });
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_LOOK_LENGTH, conflict: MESSAGE_LOOK_CLOSED, failed: FAILED });
  return { status: 200, body: { ok: true } };
}

async function searchPhoneLast4(client: Rpc, body: unknown): Promise<JsonReply> {
  const shaped = phoneBody.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_PHONE_SEARCH } };
  const { data, error } = await client.rpc("admin_unmatched_by_phone_last4", { p_last4: shaped.data.last4 });
  // 검색 함수는 manual/0023 에 있다 — 적용 전 DB 에는 함수가 없다(데이터 API 의 PGRST202)
  if (error?.code === "PGRST202") return { status: 503, body: { message: MESSAGE_PHONE_SEARCH_UNAVAILABLE } };
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_PHONE_SEARCH, failed: READ_FAILED });
  const parcels = unmatchedFromRows(data ?? []);
  if (!parcels) return { status: 500, body: { message: READ_FAILED } };
  return { status: 200, body: { parcels } };
}
