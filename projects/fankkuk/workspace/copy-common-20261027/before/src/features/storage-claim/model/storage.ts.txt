import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CARRIERS } from "@/entities/parcel/model/carrier";
import { PARCEL_TIERS } from "@/entities/parcel/model/office-parcel";
import { parseWaybillInput, WAYBILL_FORMAT_MESSAGE } from "@/entities/parcel/model/waybill-no";
import type { Viewer } from "@/entities/session/model/viewer";
import { pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 물품 보관소 (inbound-address-code INV-C13·C10 — 2026-10-21 배송 문제 재정리, 시안 v32). 로그인한 회원(팬·크리에이터)만.
// 몸통의 kind 로 셋을 가른다.
// - list: 6자리 없이 왔고 닉네임 없음이었던 대기 중 보류 상자 — 도착일·택배사·크기·포장 모양·기한(도착 + 30일)·내 확인 대기만.
//   정해진 칸 밖의 값이 오면 내보내지 않는다(strict — 송장번호·선반·전화번호 뒤 4자리가 섞여도 화면에 가지 않게).
// - candidates: 「내 물품 확인」 창의 선물 선택 — 본인의 결제 끝·입고 전 상자(선물 이름·크리에이터·결제일).
// - claim: 그 줄의 상자 + 송장번호·택배사 + 고른 선물. 맞으면 운영자 확인 대기(pending), 아니면 「물품을 찾을 수 없어요」 하나 —
//   두 값이 틀렸는지, 고른 선물이 후보가 아닌지, 다른 회원이 먼저 요청했는지 나누지 않는다. 틀린 시도는 DB 가 하루 5번까지 센다(INV-C10).
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구인지·후보인지는 DB 가 그 토큰으로 판정한다.

export const MESSAGE_STORAGE_NOT_FOUND = "물품을 찾을 수 없어요";
/** 「받는 주소 없이 보냈어요」와 같은 문장(그날 틀린 시도를 같이 센다) */
export const MESSAGE_CLAIM_LIMIT = "오늘은 더 찾을 수 없어요. 내일 다시 해 주세요";
const MESSAGE_CLAIM_DETAILS = "택배사를 고르고 송장번호를 넣은 뒤 선물을 선택해 주세요.";
const READ_FAILED = "물품을 읽지 못했어요. 잠시 뒤 다시 해 주세요.";
const FAILED = "확인 요청을 보내지 못했어요. 잠시 뒤 다시 해 주세요.";

const listRows = z.array(
  z
    .object({
      id: z.string().uuid(),
      arrived_at: z.string(),
      carrier: z.enum(CARRIERS),
      tier: z.enum(PARCEL_TIERS).nullable(),
      look: z.string().nullable(),
      deadline_at: z.string(),
      claim_pending: z.boolean(),
    })
    .strict(),
);
const candidateRows = z.array(
  z
    .object({
      box_id: z.string().uuid(),
      label: z.string(),
      item_kind: z.string(),
      creator_name: z.string(),
      paid_at: z.string(),
      tier: z.enum(PARCEL_TIERS),
    })
    .strict(),
);
const claimBody = z.object({ kind: z.literal("claim"), id: z.guid(), boxId: z.guid(), waybill: z.string().max(40), carrier: z.enum(CARRIERS) }).strict();
const listBody = z.object({ kind: z.enum(["list", "candidates"]) }).strict();
const claimAnswer = z.enum(["pending", "not_found", "not_candidate"]);

export type StorageParcel = { id: string; arrivedAt: string; carrier: string; tier: string | null; look: string | null; deadlineAt: string; claimPending: boolean };
export type StorageCandidate = { boxId: string; label: string; itemKind: string; creatorName: string; paidAt: string; tier: string };

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export async function storageRequest(deps: Deps, input: unknown): Promise<JsonReply> {
  if (!deps.viewer) return { status: 401, body: { message: "로그인이 필요해요." } };
  if (deps.viewer.role !== "fan" && deps.viewer.role !== "creator") return { status: 403, body: { message: "권한이 없어요." } };
  const kind = typeof input === "object" && input !== null ? (input as { kind?: unknown }).kind : undefined;
  if (kind === "claim") return claimStorage(deps.client, input);
  const shaped = listBody.safeParse(input);
  if (!shaped.success) return { status: 400, body: { message: "잘못된 요청이에요." } };
  return shaped.data.kind === "list" ? readStorage(deps.client) : readCandidates(deps.client);
}

async function readStorage(client: Deps["client"]): Promise<JsonReply> {
  const { data, error } = await client.rpc("storage_parcels");
  if (error) return pgErrorReply(error.code, { limit: READ_FAILED, failed: READ_FAILED });
  const rows = listRows.safeParse(data ?? []);
  if (!rows.success) return { status: 500, body: { message: READ_FAILED } };
  const parcels: StorageParcel[] = rows.data.map((r) => ({
    id: r.id,
    arrivedAt: r.arrived_at,
    carrier: r.carrier,
    tier: r.tier,
    look: r.look,
    deadlineAt: r.deadline_at,
    claimPending: r.claim_pending,
  }));
  return { status: 200, body: { parcels } };
}

async function readCandidates(client: Deps["client"]): Promise<JsonReply> {
  const { data, error } = await client.rpc("storage_claim_candidates");
  if (error) return pgErrorReply(error.code, { limit: READ_FAILED, failed: READ_FAILED });
  const rows = candidateRows.safeParse(data ?? []);
  if (!rows.success) return { status: 500, body: { message: READ_FAILED } };
  const candidates: StorageCandidate[] = rows.data.map((r) => ({
    boxId: r.box_id,
    label: r.label,
    itemKind: r.item_kind,
    creatorName: r.creator_name,
    paidAt: r.paid_at,
    tier: r.tier,
  }));
  return { status: 200, body: { candidates } };
}

async function claimStorage(client: Deps["client"], input: unknown): Promise<JsonReply> {
  const shaped = claimBody.safeParse(input);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_CLAIM_DETAILS } };
  const no = parseWaybillInput(shaped.data.waybill);
  if (!no.ok) return { status: 400, body: { message: WAYBILL_FORMAT_MESSAGE } };
  const { data, error } = await client.rpc("claim_storage_parcel", {
    p_id: shaped.data.id,
    p_box_id: shaped.data.boxId,
    p_waybill: no.value,
    p_carrier: shaped.data.carrier,
  });
  if (error?.code === "P0045") return { status: 429, body: { message: MESSAGE_CLAIM_LIMIT } };
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_CLAIM_DETAILS, failed: FAILED });
  const answer = claimAnswer.safeParse(data);
  // 모르는 답이면 요청이 갔다고 단정하지 않는다
  if (!answer.success) return { status: 500, body: { message: FAILED } };
  // 못 찾은 것은 오류가 아니라 확인의 결과다 — 200 으로 돌려주고 화면이 결과 칸에 보여 준다. 이유는 나누지 않는다
  return answer.data === "pending" ? { status: 200, body: { result: "pending" } } : { status: 200, body: { result: "not_found", message: MESSAGE_STORAGE_NOT_FOUND } };
}
