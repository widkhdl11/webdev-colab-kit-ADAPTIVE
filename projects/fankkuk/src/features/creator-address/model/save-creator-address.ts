import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseAddressInput } from "@/entities/address/model/address-ciphertext";
import { parseAddressLabel } from "@/entities/address/model/address-label";
import { parseSurchargeRegion } from "@/entities/address/model/surcharge-region";
import { sameSignedPlaintext } from "@/entities/order/model/evaluate-approval";
import type { Viewer } from "@/entities/session/model/viewer";
import type { ApprovalSigner } from "@/shared/api/approval-signer/signer";
import { parseEnvelope } from "@/shared/lib/envelope/envelope";

// 크리에이터 주소 등록·변경 — 카카오 서명이 검증된 뒤에만 저장한다 (address-protection INV-P22, INV-P1·P13·P16·P20).
// 흐름은 승인 서명 연결(features/signature-link)과 같은 두 단계다.
// 1) 요청(start): 본문에서 봉인된 주소·이름표·할증 구분만 꺼내 DB 에 요청 줄을 만든다 — 저장하지 않는다(①). 원문은 DB 가 만든다(주소 값 없음).
//    새 요청이면 DB 가 돌려준 승인 서명 연결 봉투로 서명 대상을 지정해 창구에 요청하고 거래 ID 를 적는다. 창구가 받지 못하면 그 요청을 끝낸다(봉인 지움).
//    같은 주소로 기다리는 요청이 있으면 그것을 이어 보인다(③). 가입 3단계 서명 직후의 첫 등록이면 DB 가 바로 저장하고 「저장됨」으로 답한다(④ — 판정은 DB).
// 2) 결과 확인(check): 본문에서는 요청 ID 하나만. 서버가 창구에 직접 묻고, 서명된 원문이 저장 원문과 바이트로 같고 방식이 이 창구의 방식일 때만
//    signed 로 넘긴다(②). 주소 칸 덮어쓰기·기록·요청 끝냄은 DB 가 한 처리에서 한다. 화면이 보낸 「저장됨」·서명 값은 읽지 않는다.
// 누구의 주소인지는 세션에서 확인한 사람으로 정한다(INV-L2·L3). 창구가 없으면(운영, 카카오 연결 전) 요청을 만들지 않는다(⑤).
// 응답에는 주소·봉투·원문을 싣지 않는다 — 요청 ID·기한·상태만.

/** 카카오톡 서명 요청에 보이는 요청 구분 문구(게이트웨이 상한 40자) */
export const ADDRESS_SIGN_REQUEST_MESSAGE = "팬꾹 배송지 등록·변경";

export type StartAddressSignResult =
  | { ok: true; state: "saved" }
  | { ok: true; state: "waiting"; requestId: string; expiresAt: string }
  | { ok: false; status: 400 | 401 | 403 | 409 | 429 | 503; message: string; code?: "not_linked" | "too_many" };

/** saved = 주소 칸에 저장됨 · rejected = 서명 거절 · expired = 서명 시간 지남 · failed = 서명을 확인하지 못함(원문·대상자 불일치 등) */
export type AddressSignState = "pending" | "saved" | "rejected" | "expired" | "failed";
export type CheckAddressSignResult = { ok: true; state: AddressSignState } | { ok: false; status: 401 | 403 | 404 | 503; message: string };

type Deps = { admin: Pick<SupabaseClient, "rpc">; viewer: Viewer | null; signer: ApprovalSigner | null };

const LOGIN = { ok: false, status: 401, message: "로그인이 필요합니다." } as const;
const CREATOR_ONLY = { ok: false, status: 403, message: "크리에이터 계정만 이용할 수 있습니다." } as const;
const UNAVAILABLE = { ok: false, status: 503, message: "현재 주소를 변경할 수 없습니다. 잠시 후 다시 시도해 주세요." } as const;
const NOT_SEALED = { ok: false, status: 400, message: "주소를 다시 입력해 주세요." } as const;
const NO_LABEL = { ok: false, status: 400, message: "주소 별칭을 선택해 주세요." } as const;
const NOT_SENT = { ok: false, status: 503, message: "카카오톡 인증 요청을 보내지 못했습니다. 다시 요청해 주세요." } as const;
const NOT_LINKED = {
  ok: false,
  status: 409,
  message: "카카오톡 인증 알림을 먼저 연결해 주세요. 크리에이터 설정에서 연결할 수 있습니다.",
  code: "not_linked",
} as const;
const TOO_MANY = { ok: false, status: 429, message: "요청이 많아 지금은 보낼 수 없습니다. 1시간 뒤에 다시 요청해 주세요.", code: "too_many" } as const;
const TOO_MANY_DAY = { ok: false, status: 429, message: "오늘 보낼 수 있는 요청 횟수를 모두 사용했습니다. 내일 다시 요청해 주세요.", code: "too_many" } as const;
const NOT_FOUND = { ok: false, status: 404, message: "주소 저장 요청을 찾지 못했습니다. 다시 요청해 주세요." } as const;

const startRow = z.object({
  result: z.enum(["saved_signup", "started", "pending", "not_creator", "method_refused", "not_linked", "too_many", "too_many_day"]),
  request_id: z.string().uuid().nullable(),
  payload: z.string().nullable(),
  expires_at: z.string().nullable(),
  envelope: z.unknown(),
  creator_id: z.string().uuid().nullable(),
});
const requestRow = z.object({
  state: z.enum(["pending", "saved", "rejected", "expired", "failed", "not_found"]),
  payload: z.string().nullable(),
  method: z.string().nullable(),
  gateway_tx_id: z.string().nullable(),
});
const settleRow = z.object({ result: z.enum(["saved", "rejected", "expired", "failed", "not_found", "method_refused"]) });

function firstRow<T>(schema: z.ZodType<T>, data: unknown): T {
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  return schema.parse(Array.isArray(data) ? data[0] : data);
}

function gate(deps: Deps): { ok: false; status: 401 | 403 | 503; message: string } | { ok: true; actor: string; signer: ApprovalSigner } {
  if (!deps.viewer) return LOGIN;
  if (deps.viewer.role !== "creator") return CREATOR_ONLY;
  // INV-P22 ⑤: 창구가 없으면(운영) 로그인만으로 주소를 바꾸지 못한다 — 가짜로 넘어가지 않는다
  if (!deps.signer) return UNAVAILABLE;
  return { ok: true, actor: deps.viewer.userId, signer: deps.signer };
}

async function closeRequest(deps: Deps, actor: string, requestId: string): Promise<void> {
  const { error } = await deps.admin.rpc("close_creator_address_sign", { p_actor_id: actor, p_request_id: requestId });
  // 끝내지 못해도 그 요청은 5분 뒤 기한으로 끝나고 정리 작업이 봉인을 지운다 — 서버 기록에만 남긴다
  if (error) console.error(`주소 서명 요청을 끝내지 못했다: ${error.code ?? "코드 없음"}`);
}

export async function startCreatorAddressSign(deps: Deps, body: unknown): Promise<StartAddressSignResult> {
  const g = gate(deps);
  if (!g.ok) return g;

  // INV-P1: 봉인 형식이 아니면 거부 — 평문 주소가 들어올 자리가 없다
  const input = parseAddressInput(body);
  if (!input.ok) return NOT_SEALED;
  const fields = body as { label?: unknown; region?: unknown; resend?: unknown };
  const label = parseAddressLabel(fields.label);
  if (!label) return NO_LABEL;
  const region = parseSurchargeRegion(fields.region);
  if (!region) return NOT_SEALED;

  const { data, error } = await deps.admin.rpc("start_creator_address_sign", {
    p_actor_id: g.actor,
    p_envelope: input.value,
    p_label: label,
    p_region: region,
    p_method: g.signer.kind,
    // 「다시 보내기」만 기다리는 요청을 끝내고 새로 보낸다(③)
    p_resend: fields.resend === true,
  });
  if (error) {
    if (error.code === "22023") return NOT_SEALED;
    throw new Error(`주소 서명 요청을 만들지 못했다: ${error.code}`);
  }
  const row = firstRow(startRow, data);
  if (row.result === "saved_signup") return { ok: true, state: "saved" };
  if (row.result === "not_creator") return CREATOR_ONLY;
  if (row.result === "method_refused") return UNAVAILABLE;
  if (row.result === "not_linked") return NOT_LINKED;
  if (row.result === "too_many") return TOO_MANY;
  if (row.result === "too_many_day") return TOO_MANY_DAY;
  if (!row.request_id || !row.payload || !row.expires_at) throw new Error("주소 서명 요청 응답에 칸이 비었다");
  // INV-P22 ③: 기다리는 요청을 이어 보인다 — 카카오톡을 다시 보내지 않는다
  if (row.result === "pending") return { ok: true, state: "waiting", requestId: row.request_id, expiresAt: row.expires_at };

  // INV-P22 ①: 서명 대상은 승인 서명 연결 봉투로 지정한다 — 앱 서버는 열지 않고 넘긴다
  const link = parseEnvelope(row.envelope);
  if (!link) throw new Error("연결 봉투 꼴이 아니다");
  if (!row.creator_id) throw new Error("주소 서명 요청 응답에 크리에이터 ID 가 없다");
  // 창구 호출이 예외를 던져도 보내지 못한 것으로 친다 — 거래 ID 없는 요청을 기다림으로 남기면 같은 주소로 다시 누를 때 그것을 이어 보인다
  let sent: Awaited<ReturnType<ApprovalSigner["requestSignature"]>>;
  try {
    sent = await g.signer.requestSignature({
      requestId: row.request_id,
      plaintext: row.payload,
      requestMessage: ADDRESS_SIGN_REQUEST_MESSAGE,
      envelope: link,
      creatorId: row.creator_id,
    });
  } catch (e) {
    console.error(`주소 서명 요청을 보내다 오류: ${e instanceof Error ? e.name : typeof e}`);
    sent = { ok: false, down: true, retry: false };
  }
  if (!sent.ok) {
    await closeRequest(deps, g.actor, row.request_id);
    return NOT_SENT;
  }
  const rec = await deps.admin.rpc("record_creator_address_sign_tx", { p_actor_id: g.actor, p_request_id: row.request_id, p_tx_id: sent.txId });
  if (rec.error || rec.data !== "recorded") {
    // 거래 ID 가 없으면 결과를 적는 함수가 받지 않는다 — 요청을 끝내고 다시 요청하게
    console.error(`거래 ID 를 적지 못했다: ${rec.error?.code ?? String(rec.data)}`);
    await closeRequest(deps, g.actor, row.request_id);
    return NOT_SENT;
  }
  return { ok: true, state: "waiting", requestId: row.request_id, expiresAt: row.expires_at };
}

const checkBody = z.object({ requestId: z.string().uuid() });

export async function checkCreatorAddressSign(deps: Deps, body: unknown): Promise<CheckAddressSignResult> {
  const g = gate(deps);
  if (!g.ok) return g;
  // 요청 ID 외의 값(저장됨·서명 값 등)은 읽지 않는다
  const parsed = checkBody.safeParse(body);
  if (!parsed.success) return NOT_FOUND;
  const requestId = parsed.data.requestId;

  const read = await deps.admin.rpc("creator_address_sign_request", { p_actor_id: g.actor, p_request_id: requestId });
  if (read.error) throw new Error(`주소 서명 요청을 읽지 못했다: ${read.error.code}`);
  const req = firstRow(requestRow, read.data);
  if (req.state === "not_found") return NOT_FOUND;
  if (req.state !== "pending") return { ok: true, state: req.state };
  // 거래 ID 가 아직 없다 — 요청을 보내는 중이다. 다음 확인에서 다시 묻는다
  if (!req.payload || !req.gateway_tx_id) return { ok: true, state: "pending" };

  const res = await g.signer.signatureResult({ requestId, txId: req.gateway_tx_id, plaintext: req.payload });
  if (res.state === "pending" || res.state === "unavailable") return { ok: true, state: "pending" };
  // INV-P22 ②: 서명된 원문이 저장 원문과 바이트로 같고 방식이 이 창구의 방식일 때만 signed. 거절·기한은 그대로, 그 밖은 실패로 끝낸다
  const signed = res.state === "signed" && res.method === g.signer.kind && sameSignedPlaintext(req.payload, res.signedPlaintext);
  const outcome = signed ? "signed" : res.state === "rejected" ? "rejected" : res.state === "expired" ? "expired" : "failed";
  const { data, error } = await deps.admin.rpc("settle_creator_address_sign", {
    p_actor_id: g.actor,
    p_request_id: requestId,
    p_outcome: outcome,
    p_signed_content: signed && res.state === "signed" ? res.signedPlaintext : null,
    p_method: g.signer.kind,
  });
  if (error) throw new Error(`주소 서명 결과를 적지 못했다: ${error.code}`);
  const row = firstRow(settleRow, data);
  if (row.result === "not_found") return NOT_FOUND;
  if (row.result === "method_refused") return UNAVAILABLE;
  return { ok: true, state: row.result };
}
