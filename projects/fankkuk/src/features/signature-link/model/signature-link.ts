import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "@/entities/session/model/viewer";
import type { ApprovalSigner } from "@/shared/api/approval-signer/signer";
import { parseEnvelope } from "@/shared/lib/envelope/envelope";
import { sameSignedPlaintext } from "@/entities/order/model/evaluate-approval";

// 승인 서명 연결하기 (approval-signature INV-S16) — 앱 서버 쪽 두 단계.
// 1) 시작: 본문에서 봉인된 연결 정보(이름·생년월일·휴대폰 번호) 하나만 꺼내 DB 에 요청을 만들고(고정 원문 = 연결 요청 ID + 요청 시각, 5분 기한)
//    서명 창구에 시험 서명을 요청한다(요청 구분 「팬꾹 승인 서명 연결」). 앱 서버는 봉투를 열지 않는다. 창구가 돌려준 거래 ID 를 DB 에 적는다.
// 2) 결과 확인: 본문에서는 요청 ID 하나만 받는다. 서명 결과는 서버가 창구에 직접 묻고(거래 ID 그대로), 서명된 원문을 저장 원문과 바이트 대조한 뒤
//    「연결됨」은 DB 가 원문 대조를 다시 통과했을 때만 적는다. 서명자가 적은 사람 본인인지는 게이트웨이가 본다(INV-S4) —
//    브라우저가 보낸 「연결됨」·서명 값은 들어올 자리가 없다.
// 누구의 연결인지는 세션에서 확인한 사람으로 정한다(INV-L2·L3). 창구가 없으면(운영, 드림시큐리티 연결 전) 요청을 만들지 않는다(S16d).

export type StartLinkResult =
  | { ok: true; requestId: string; expiresAt: string }
  | { ok: false; status: 400 | 401 | 403 | 429 | 503; message: string };

export type LinkCheckState = "pending" | "linked" | "failed";
export type CheckLinkResult = { ok: true; state: LinkCheckState; linkedAt: string | null } | { ok: false; status: 400 | 401 | 403 | 404 | 503; message: string };

type Deps = { admin: Pick<SupabaseClient, "rpc">; viewer: Viewer | null; signer: ApprovalSigner | null };

export const LINK_UNAVAILABLE = "현재 승인 서명을 연결할 수 없습니다.";
/** INV-S16: 연결 시험 서명의 요청 구분 문구 — 카카오 지갑에 보인다 */
export const LINK_REQUEST_MESSAGE = "팬꾹 승인 서명 연결";
const LOGIN = { ok: false, status: 401, message: "로그인이 필요합니다." } as const;
const CREATOR_ONLY = { ok: false, status: 403, message: "크리에이터 계정만 이용할 수 있습니다." } as const;
const UNAVAILABLE = { ok: false, status: 503, message: LINK_UNAVAILABLE } as const;
const NOT_SEALED = { ok: false, status: 400, message: "이름·생년월일·휴대폰 번호를 다시 입력해 주세요." } as const;
const TOO_MANY = { ok: false, status: 429, message: "요청이 많아 지금은 보낼 수 없습니다. 1시간 뒤에 다시 요청해 주세요." } as const;
const TOO_MANY_DAY = { ok: false, status: 429, message: "오늘 보낼 수 있는 요청 횟수를 모두 사용했습니다. 내일 다시 요청해 주세요." } as const;
const NOT_FOUND = { ok: false, status: 404, message: "연결 요청을 찾지 못했습니다. 다시 요청해 주세요." } as const;

const startRow = z.object({
  result: z.enum(["started", "not_creator", "method_refused", "too_many", "too_many_day"]),
  request_id: z.string().uuid().nullable(),
  payload: z.string().nullable(),
  expires_at: z.string().nullable(),
  // 새 요청의 크리에이터 ID — 게이트웨이가 봉투 안의 것과 대조한다(브라우저가 봉인한 크리에이터 ID 가 이 계정의 것인지)
  creator_id: z.string().uuid().nullable(),
});
const requestRow = z.object({
  state: z.enum(["pending", "linked", "failed", "expired", "not_found"]),
  payload: z.string().nullable(),
  method: z.string().nullable(),
  // manual/0028 이 더한 칸 — 그 전 DB 에는 없다(없으면 거래 ID 가 없는 것과 같다: 창구에 묻지 않고 기다림)
  gateway_tx_id: z.string().nullable().optional(),
});
const settleRow = z.object({
  result: z.enum(["linked", "failed", "expired", "not_found", "method_refused"]),
  linked_at: z.string().nullable(),
});

function firstRow<T>(schema: z.ZodType<T>, data: unknown): T {
  const row = Array.isArray(data) ? data[0] : data;
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  return schema.parse(row);
}

function gate(deps: Deps): { ok: false; status: 401 | 403 | 503; message: string } | { ok: true; viewer: Viewer; signer: ApprovalSigner } {
  if (!deps.viewer) return LOGIN;
  if (deps.viewer.role !== "creator") return CREATOR_ONLY;
  // INV-S16 S16d: 창구가 없으면(운영) 연결 요청을 만들지 않는다 — 시험 창구로 넘어가지 않는다
  if (!deps.signer) return UNAVAILABLE;
  return { ok: true, viewer: deps.viewer, signer: deps.signer };
}

/** ipHash: 요청한 접속 주소의 해시(signup INV-U10·U14 와 같은 방식) — 같은 주소 하루 한도에 쓴다. */
export async function startSignatureLink(deps: Deps, body: unknown, ipHash: string): Promise<StartLinkResult> {
  const g = gate(deps);
  if (!g.ok) return g;
  // 평문 연결 정보가 들어올 자리가 없다 — 봉인 형식이 아니면 거부
  const identity = parseEnvelope(typeof body === "object" && body !== null ? (body as { identity?: unknown }).identity : null);
  if (!identity) return NOT_SEALED;

  const { data, error } = await deps.admin.rpc("start_signature_link", { p_actor_id: g.viewer.userId, p_envelope: identity, p_method: g.signer.kind, p_ip_hash: ipHash });
  if (error) {
    if (error.code === "22023") return NOT_SEALED;
    throw new Error(`연결 요청을 만들지 못했다: ${error.code}`);
  }
  const row = firstRow(startRow, data);
  if (row.result === "not_creator") return CREATOR_ONLY;
  if (row.result === "method_refused") return UNAVAILABLE;
  if (row.result === "too_many") return TOO_MANY;
  if (row.result === "too_many_day") return TOO_MANY_DAY;
  if (!row.request_id || !row.payload || !row.expires_at || !row.creator_id) throw new Error("연결 요청 응답에 칸이 비었다");

  const sent = await g.signer.requestSignature({ requestId: row.request_id, plaintext: row.payload, requestMessage: LINK_REQUEST_MESSAGE, envelope: identity, creatorId: row.creator_id });
  const recorded = sent.ok
    ? await deps.admin.rpc("record_signature_link_tx", { p_actor_id: g.viewer.userId, p_request_id: row.request_id, p_tx_id: sent.txId })
    : null;
  if (!sent.ok || !recorded || recorded.error || recorded.data !== "recorded") {
    // 창구가 요청을 받지 못했거나 거래 ID 를 적지 못했으면 그 요청은 실패로 닫는다 — 대기 중으로 남겨 두지 않는다
    if (recorded?.error) console.error(`거래 ID 를 적지 못했다: ${recorded.error.code ?? "코드 없음"}`);
    const closed = await deps.admin.rpc("settle_signature_link", { p_actor_id: g.viewer.userId, p_request_id: row.request_id, p_outcome: "failed", p_signed_content: null, p_method: g.signer.kind });
    // 닫지 못해도 응답은 같다(그 요청은 5분 뒤 기한으로 끝난다) — 서버 기록에만 남긴다
    if (closed.error) console.error(`보내지 못한 연결 요청을 닫지 못했다: ${closed.error.code ?? "코드 없음"}`);
    return UNAVAILABLE;
  }
  return { ok: true, requestId: row.request_id, expiresAt: row.expires_at };
}

const checkBody = z.object({ requestId: z.string().uuid() });

export async function checkSignatureLink(deps: Deps, body: unknown): Promise<CheckLinkResult> {
  const g = gate(deps);
  if (!g.ok) return g;
  // 요청 ID 외의 값(연결됨·서명 값 등)은 읽지 않는다
  const parsed = checkBody.safeParse(body);
  if (!parsed.success) return NOT_FOUND;
  const requestId = parsed.data.requestId;
  const actor = g.viewer.userId;

  const read = await deps.admin.rpc("signature_link_request", { p_actor_id: actor, p_request_id: requestId });
  if (read.error) throw new Error(`연결 요청을 읽지 못했다: ${read.error.code}`);
  const req = firstRow(requestRow, read.data);
  if (req.state === "not_found") return NOT_FOUND;
  if (req.state === "linked") return { ok: true, state: "linked", linkedAt: null };
  if (req.state === "failed" || req.state === "expired") return { ok: true, state: "failed", linkedAt: null };
  if (!req.payload) throw new Error("대기 중인 연결 요청에 원문이 없다");

  // 거래 ID 가 아직 없다 — 요청을 보내는 중이다. 다음 확인에서 다시 묻는다
  if (!req.gateway_tx_id) return { ok: true, state: "pending", linkedAt: null };
  const res = await g.signer.signatureResult({ requestId, txId: req.gateway_tx_id, plaintext: req.payload });
  if (res.state === "pending" || res.state === "unavailable") return { ok: true, state: "pending", linkedAt: null };
  // INV-S2: 서명된 원문이 저장 원문과 바이트 단위로 같고 방식이 이 창구의 방식일 때만 signed 로 넘긴다. 거부·기한·불일치는 실패로 닫는다
  const signed = res.state === "signed" && res.method === g.signer.kind && sameSignedPlaintext(req.payload, res.signedPlaintext);
  const { data, error } = await deps.admin.rpc("settle_signature_link", {
    p_actor_id: actor,
    p_request_id: requestId,
    p_outcome: signed ? "signed" : "failed",
    p_signed_content: signed && res.state === "signed" ? res.signedPlaintext : null,
    p_method: g.signer.kind,
  });
  if (error) {
    console.error(`연결 결과를 적지 못했다: ${error.code ?? "코드 없음"}`);
    throw new Error(`연결 결과를 적지 못했다: ${error.code}`);
  }
  const row = firstRow(settleRow, data);
  if (row.result === "linked") return { ok: true, state: "linked", linkedAt: row.linked_at };
  if (row.result === "not_found") return NOT_FOUND;
  if (row.result === "method_refused") return UNAVAILABLE;
  return { ok: true, state: "failed", linkedAt: null };
}
