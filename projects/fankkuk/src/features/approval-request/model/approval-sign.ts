import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { APPROVAL_EXPIRED_MESSAGE } from "@/entities/order/config/approval-deadline";
import { parseApprovalPlaintext } from "@/entities/order/model/approval-plaintext";
import { sameSignedPlaintext } from "@/entities/order/model/evaluate-approval";
import type { Viewer } from "@/entities/session/model/viewer";
import type { ApprovalSigner } from "@/shared/api/approval-signer/signer";
import { parseEnvelope } from "@/shared/lib/envelope/envelope";

// 승인 — 「승인」 누를 때 서명 요청 → 기다림 → 승인됨/다시 요청 (approval-signature INV-S1·S2·S7·S11·S12·S13·S17, 2026-10-29 (2)).
// 1) 시작: 본문에서 승인 요청 ID 하나만 꺼낸다. DB 가 그 주문의 크리에이터인지·승인할 수 있는지·주소·연결을 보고 서명 요청 줄을 만든다
//    (원문은 DB 의 원문 함수가 주문에서 만든 네 값). 기다리는 요청이 있으면 그것을 돌려받는다. 새 요청이면 창구에 원문·요청 구분 문구·연결 봉투를
//    넘기고 거래 ID 를 적는다. 창구가 요청을 받지 못하면 그 요청을 끝낸다(다시 요청할 수 있게).
// 2) 결과 확인: 본문에서 승인 요청 ID 하나만. 앱 서버가 창구(게이트웨이)에 묻고, signed 면 서명된 원문을 저장 원문과 다시 바이트 대조한 뒤(INV-S2)
//    그 자리에서 승인 함수를 부른다(승인과 서명 저장은 DB 가 한 처리로, INV-S12). 화면이 보낸 「서명했다」·서명 값은 읽지 않는다(S17d).
// 누가 승인하는지는 세션에서 확인한 사람이다(INV-L2·L3). 창구가 없으면(운영, 게이트웨이 설정 전) 요청을 만들지 않는다(INV-S11).

export const APPROVAL_REQUEST_MESSAGE = "팬꾹 선물 수령 승인";

export type SignView =
  | { state: "none" }
  | { state: "waiting"; expiresAt: string }
  | { state: "approved" }
  | { state: "ended"; reason: "expired" | "failed" };

/** code: 화면이 갈래를 나눌 실패 — no_address 면 주소 단계로(INV-S13), too_many 면 「다시 요청」을 숨긴다 */
export type SignOutcome =
  | { ok: true; view: SignView }
  | { ok: false; status: 400 | 401 | 403 | 404 | 409 | 429 | 503; message: string; code?: "no_address" | "too_many" };

type Deps = { admin: Pick<SupabaseClient, "rpc">; viewer: Viewer | null; signer: ApprovalSigner | null };

const LOGIN = { ok: false, status: 401, message: "로그인이 필요합니다." } as const;
const CREATOR_ONLY = { ok: false, status: 403, message: "크리에이터 계정만 이용할 수 있습니다." } as const;
const UNAVAILABLE = { ok: false, status: 503, message: "현재 승인할 수 없습니다. 잠시 후 다시 시도해 주세요." } as const;
const BAD = { ok: false, status: 400, message: "잘못된 요청입니다." } as const;
const NOT_FOUND = { ok: false, status: 404, message: "승인 요청을 찾을 수 없습니다." } as const;
const NOT_SENT = { ok: false, status: 503, message: "카카오톡 인증 요청을 보내지 못했습니다. 다시 요청해 주세요." } as const;
const ALREADY = { ok: false, status: 409, message: "이미 처리된 요청입니다. 새로고침해 결과를 확인해 주세요." } as const;
const NOT_APPROVABLE = { ok: false, status: 409, message: "현재 승인할 수 없는 선물입니다. 새로고침해 주세요." } as const;
const EXPIRED = { ok: false, status: 409, message: APPROVAL_EXPIRED_MESSAGE } as const;
const NO_ADDRESS = { ok: false, status: 409, message: "받는 주소를 먼저 등록해 주세요.", code: "no_address" } as const;
const NOT_LINKED = { ok: false, status: 409, message: "승인 서명을 먼저 연결해 주세요. 크리에이터 설정에서 연결할 수 있습니다." } as const;
const TOO_MANY = { ok: false, status: 429, message: "오늘 이 선물에 보낼 수 있는 인증 요청 횟수를 모두 사용했습니다. 내일 다시 요청해 주세요.", code: "too_many" } as const;

const bodySchema = z.object({ requestId: z.string().regex(/^apr_[0-9A-Za-z]{1,40}$/) });

const startRow = z.object({
  result: z.enum(["started", "pending", "not_found", "already", "expired", "not_approvable", "no_address", "not_linked", "method_refused", "too_many_day"]),
  sign_request_id: z.string().uuid().nullable(),
  plaintext: z.string().nullable(),
  expires_at: z.string().nullable(),
  envelope: z.unknown(),
  // 새 요청(started)일 때 그 주문의 크리에이터 ID — 게이트웨이가 봉투 안의 것과 대조한다
  creator_id: z.string().uuid().nullable(),
});
const currentRow = z.object({
  result: z.enum(["found", "none", "approved", "not_found"]),
  sign_request_id: z.string().uuid().nullable(),
  state: z.enum(["pending", "signed", "failed", "expired"]).nullable(),
  plaintext: z.string().nullable(),
  gateway_tx_id: z.string().nullable(),
  method: z.string().nullable(),
  expires_at: z.string().nullable(),
});
const settleResult = z.enum(["approved", "already", "not_found", "sign_expired", "sign_failed", "signature_mismatch", "expired", "not_approvable", "no_address"]);

function firstRow<T>(schema: z.ZodType<T>, data: unknown): T {
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  return schema.parse(Array.isArray(data) ? data[0] : data);
}

function gate(deps: Deps, body: unknown): { ok: false; status: 400 | 401 | 403 | 503; message: string } | { ok: true; actor: string; signer: ApprovalSigner; requestId: string } {
  if (!deps.viewer) return LOGIN;
  if (deps.viewer.role !== "creator") return CREATOR_ONLY;
  // INV-S11: 창구가 없으면(운영, 게이트웨이 설정 전) 승인을 받지 않는다 — 가짜로 넘어가지 않는다
  if (!deps.signer) return UNAVAILABLE;
  // 요청 ID 외의 값(사람·서명·「서명됨」)은 읽지 않는다
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return BAD;
  return { ok: true, actor: deps.viewer.userId, signer: deps.signer, requestId: parsed.data.requestId };
}

async function closeSign(deps: Deps, actor: string, signRequestId: string, outcome: "failed" | "expired"): Promise<void> {
  const { error } = await deps.admin.rpc("close_approval_sign", { p_actor_id: actor, p_sign_request_id: signRequestId, p_outcome: outcome });
  // 끝내지 못해도 그 요청은 5분 뒤 기한으로 끝난다 — 서버 기록에만 남긴다
  if (error) console.error(`서명 요청을 끝내지 못했다: ${error.code ?? "코드 없음"}`);
}

export async function startApprovalSign(deps: Deps, body: unknown): Promise<SignOutcome> {
  const g = gate(deps, body);
  if (!g.ok) return g;

  const { data, error } = await deps.admin.rpc("start_approval_sign", { p_actor_id: g.actor, p_request_id: g.requestId, p_method: g.signer.kind });
  if (error) throw new Error(`서명 요청을 만들지 못했다: ${error.code}`);
  const row = firstRow(startRow, data);
  if (row.result === "not_found") return NOT_FOUND;
  if (row.result === "already") return ALREADY;
  if (row.result === "expired") return EXPIRED;
  if (row.result === "not_approvable") return NOT_APPROVABLE;
  if (row.result === "no_address") return NO_ADDRESS;
  if (row.result === "not_linked") return NOT_LINKED;
  if (row.result === "method_refused") return UNAVAILABLE;
  if (row.result === "too_many_day") return TOO_MANY;
  if (!row.sign_request_id || !row.plaintext || !row.expires_at) throw new Error("서명 요청 응답에 칸이 비었다");
  // INV-S17 S17b: 기다리는 요청이 있으면 그 요청을 이어 보인다 — 카카오톡을 다시 보내지 않는다
  if (row.result === "pending") return { ok: true, view: { state: "waiting", expiresAt: row.expires_at } };

  // INV-S1: 원문이 네 값 꼴이 아니면 밖으로 보내지 않는다(DB 원문 함수와 같은 꼴인지 한 번 더)
  if (!parseApprovalPlaintext(row.plaintext)) throw new Error("서명 원문 꼴이 네 값이 아니다");
  const envelope = parseEnvelope(row.envelope);
  if (!envelope) throw new Error("연결 봉투 꼴이 아니다");
  if (!row.creator_id) throw new Error("서명 요청 응답에 크리에이터 ID 가 없다");

  const sent = await g.signer.requestSignature({ requestId: row.sign_request_id, plaintext: row.plaintext, requestMessage: APPROVAL_REQUEST_MESSAGE, envelope, creatorId: row.creator_id });
  if (!sent.ok) {
    await closeSign(deps, g.actor, row.sign_request_id, "failed");
    return NOT_SENT;
  }
  const rec = await deps.admin.rpc("record_approval_sign_tx", { p_actor_id: g.actor, p_sign_request_id: row.sign_request_id, p_tx_id: sent.txId });
  if (rec.error || rec.data !== "recorded") {
    // 거래 ID 가 없으면 승인 함수가 그 결과를 받지 않는다 — 요청을 끝내고 다시 요청하게
    console.error(`거래 ID 를 적지 못했다: ${rec.error?.code ?? String(rec.data)}`);
    await closeSign(deps, g.actor, row.sign_request_id, "failed");
    return NOT_SENT;
  }
  return { ok: true, view: { state: "waiting", expiresAt: row.expires_at } };
}

export async function checkApprovalSign(deps: Deps, body: unknown): Promise<SignOutcome> {
  const g = gate(deps, body);
  if (!g.ok) return g;

  const read = await deps.admin.rpc("approval_sign_current", { p_actor_id: g.actor, p_request_id: g.requestId });
  if (read.error) throw new Error(`서명 요청을 읽지 못했다: ${read.error.code}`);
  const cur = firstRow(currentRow, read.data);
  // S17d: 남의 요청은 없는 요청과 같은 답
  if (cur.result === "not_found") return NOT_FOUND;
  if (cur.result === "approved") return { ok: true, view: { state: "approved" } };
  if (cur.result === "none") return { ok: true, view: { state: "none" } };
  if (!cur.sign_request_id || !cur.state || !cur.expires_at) throw new Error("서명 요청 응답에 칸이 비었다");
  if (cur.state === "expired") return { ok: true, view: { state: "ended", reason: "expired" } };
  if (cur.state !== "pending") return { ok: true, view: { state: "ended", reason: "failed" } };
  const waiting: SignOutcome = { ok: true, view: { state: "waiting", expiresAt: cur.expires_at } };
  // 거래 ID 가 아직 없다 — 요청을 보내는 중이다. 다음 확인에서 다시 묻는다
  if (!cur.plaintext || !cur.gateway_tx_id) return waiting;

  const signId = cur.sign_request_id;
  const res = await g.signer.signatureResult({ requestId: signId, txId: cur.gateway_tx_id, plaintext: cur.plaintext });
  if (res.state === "pending" || res.state === "unavailable") return waiting;
  if (res.state === "expired") {
    await closeSign(deps, g.actor, signId, "expired");
    return { ok: true, view: { state: "ended", reason: "expired" } };
  }
  // 거부·원문/대상자 불일치(INV-S2·S4), 그리고 서명된 원문이 저장 원문과 다르거나 방식이 이 창구와 다르면 — 승인하지 않고 끝낸다
  if (res.state !== "signed" || res.method !== g.signer.kind || res.method !== cur.method || !sameSignedPlaintext(cur.plaintext, res.signedPlaintext)) {
    await closeSign(deps, g.actor, signId, "failed");
    return { ok: true, view: { state: "ended", reason: "failed" } };
  }

  const { data, error } = await deps.admin.rpc("settle_approval_sign", {
    p_actor_id: g.actor,
    p_sign_request_id: signId,
    p_signed_plaintext: res.signedPlaintext,
    p_signature: res.signature,
    p_signed_at: res.signedAt,
    p_method: res.method,
  });
  if (error) throw new Error(`승인을 저장하지 못했다: ${error.code}`);
  const result = settleResult.parse(data);
  // INV-S5: 이미 승인됐으면(같은 서명이 두 번) 처음 결과 그대로
  if (result === "approved" || result === "already") return { ok: true, view: { state: "approved" } };
  if (result === "not_found") return NOT_FOUND;
  if (result === "sign_expired") return { ok: true, view: { state: "ended", reason: "expired" } };
  if (result === "sign_failed" || result === "signature_mismatch") return { ok: true, view: { state: "ended", reason: "failed" } };
  // INV-S6: 168시간이 지났으면 자동 처리 전이라도 승인하지 않는다 — 거절과 같은 문구
  if (result === "expired") return EXPIRED;
  if (result === "no_address") return NO_ADDRESS;
  return NOT_APPROVABLE;
}
