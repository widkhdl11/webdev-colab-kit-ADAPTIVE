import { randomUUID } from "node:crypto";
import { z } from "zod";
import { LINK_REQUEST_MESSAGE } from "@/entities/creator/model/signature-link-request";
import { sameSignedPlaintext } from "@/entities/order/model/evaluate-approval";
import type { ApprovalSigner, SignatureResult, SignRequestStart } from "@/shared/api/approval-signer/signer";
import { phoneHash, type PhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { parseEnvelope } from "@/shared/lib/envelope/envelope";
import { phoneSchema } from "./signup-input";

// 크리에이터 가입 3단계 — 카카오 서명 한 번으로 휴대폰 확인과 승인 서명 연결(signup INV-U19 · approval-signature INV-S16).
// 앱 서버 쪽 두 단계. DB 함수는 모두 앱 서버 키 전용이고, 개인정보 구역(pii)의 표만 쓴다(supabase/manual/0037).
// 1) 시작: 본문에서 봉투(이름·생년월일·번호를 브라우저가 공개키로 봉인)·크리에이터 ID(봉투 안에도 같은 값)·번호를 받는다. 앱 서버는 봉투를 열지 않는다.
//    번호는 해시로만 DB 에 넘기고(INV-U18), 원문은 창구에만 넘긴다 — 창구가 봉투 속 번호·서명 결과 번호와 같은지 본다(INV-U19 ②).
//    번호표(확인 ID)는 요청마다 새로 발급한다. 앞 번호표의 기다리는 요청은 DB 가 같은 처리에서 끝낸다.
//    창구 요청이 장애로 실패하면 한 번 더 불러 보고, 그래도 장애면 그 번호표에 「창구 장애 확인」을 적는다(INV-U20) — 그때만 6자리 길이 열린다.
// 2) 결과 확인: 본문에서는 요청 ID 하나만 받고 번호표는 쿠키에서만 읽는다. 결과는 서버가 창구에 직접 묻는다.
//    서명된 원문이 저장 원문과 바이트 단위로 같고 방식이 이 창구의 방식일 때만 「서명됨」으로 넘기고, DB 가 다시 대조한 뒤 확인 줄에 「확인됨」을 적는다(INV-U1).
//    서명 거절·기한 지남·대상자 불일치는 장애가 아니다(실패). 결과 조회가 두 번 연달아 실패하면 장애다(INV-U20 정함).
// 브라우저가 보낸 「서명 완료」·서명 값·번호표는 들어올 자리가 없다.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export type CreatorSignDeps = {
  admin: { rpc: Rpc };
  /** null = 운영에서 서명 창구 설정이 없다 — 크리에이터 가입을 받지 않는다(설정 없음은 장애가 아니다, INV-U19) */
  signer: ApprovalSigner | null;
  phoneKeys: () => PhoneKeys;
  /** 시험이 바꿔 넣는다 */
  newTicket?: () => string;
};

/** INV-U16 정함: 서명 결과의 생년월일로 창구가 확인하는 최소 나이 */
export const CREATOR_SIGN_MIN_AGE = 14;

export type CreatorSignFail = { ok: false; status: 400 | 404 | 429 | 503; message: string };
export type StartCreatorSignResult =
  | { ok: true; state: "pending"; ticket: string; requestId: string; expiresAt: string }
  | { ok: true; state: "down"; ticket: string }
  | CreatorSignFail;
export type CreatorSignState = "pending" | "verified" | "failed" | "exists" | "down";
export type CheckCreatorSignResult = { ok: true; state: CreatorSignState } | CreatorSignFail;

export const CREATOR_SIGN_CLOSED_MESSAGE = "현재 회원가입을 이용할 수 없습니다.";
const CLOSED = { ok: false, status: 503, message: CREATOR_SIGN_CLOSED_MESSAGE } as const;
const NOT_SEALED = { ok: false, status: 400, message: "이름·생년월일·휴대폰 번호를 다시 입력해 주세요." } as const;
const NOT_ACCEPTED = { ok: false, status: 400, message: "이름·생년월일·휴대폰 번호를 확인해 주세요." } as const;
const TOO_MANY = { ok: false, status: 429, message: "요청이 많아 지금은 보낼 수 없습니다. 1시간 뒤에 다시 요청해 주세요." } as const;
const TOO_MANY_DAY = { ok: false, status: 429, message: "오늘 보낼 수 있는 요청 횟수를 모두 사용했습니다. 내일 다시 요청해 주세요." } as const;
const NOT_FOUND = { ok: false, status: 404, message: "인증 요청을 찾지 못했습니다. 다시 요청해 주세요." } as const;

/** DB 에 함수가 없다(개인정보 구역 SQL 적용 전) — 막힌 쪽으로 답한다 */
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);

const startBody = z.object({ creatorId: z.string().uuid(), phone: phoneSchema });
const startRow = z.object({
  result: z.enum(["started", "too_many", "too_many_day", "method_refused", "creator_taken"]),
  request_id: z.string().uuid().nullable(),
  payload: z.string().nullable(),
  expires_at: z.string().nullable(),
});
const requestRow = z.object({
  state: z.enum(["pending", "verified", "failed", "expired", "exists", "down", "not_found"]),
  payload: z.string().nullable(),
  gateway_tx_id: z.string().nullable(),
});
const settleRow = z.object({ result: z.enum(["verified", "exists", "failed", "expired", "not_found", "method_refused"]) });
const checkBody = z.object({ requestId: z.string().uuid() });
const ticketSchema = z.string().uuid();

function firstRow<T>(schema: z.ZodType<T>, data: unknown): T {
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  return schema.parse(Array.isArray(data) ? data[0] : data);
}

async function close(deps: CreatorSignDeps, ticket: string, requestId: string, outcome: "failed" | "down"): Promise<boolean> {
  const r = await deps.admin.rpc("close_signup_sign", { p_ticket: ticket, p_request_id: requestId, p_outcome: outcome });
  if (r.error) console.error(`가입 서명 요청을 닫지 못했다(${outcome}): ${r.error.code ?? "코드 없음"}`);
  return !r.error;
}

/** ipHash: 요청한 접속 주소의 해시(INV-U10·U14 와 같은 방식). prevTicket: 쿠키에 있던 앞 번호표(있으면 그 기다리는 요청을 끝낸다). */
export async function startCreatorSign(deps: CreatorSignDeps, body: unknown, ipHash: string, prevTicket: string | null): Promise<StartCreatorSignResult> {
  if (!deps.signer) return CLOSED;
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  // INV-U19 ⑤: 평문 이름·생년월일이 들어올 자리가 없다 — 봉인 형식이 아니면 거부
  const envelope = parseEnvelope(raw.identity);
  const parsed = startBody.safeParse(raw);
  if (!envelope || !parsed.success) return NOT_SEALED;
  const { creatorId, phone } = parsed.data;
  const signer = deps.signer;
  const ticket = (deps.newTicket ?? randomUUID)();
  const prev = ticketSchema.safeParse(prevTicket);

  const started = await deps.admin.rpc("start_signup_sign", {
    p_ticket: ticket,
    p_prev_ticket: prev.success ? prev.data : null,
    p_creator_id: creatorId,
    p_phone_hash: phoneHash(deps.phoneKeys(), phone),
    p_ip_hash: ipHash,
    p_envelope: envelope,
    p_method: signer.kind,
  });
  if (started.error) {
    if (started.error.code && MISSING_FUNCTION.has(started.error.code)) return CLOSED;
    if (started.error.code === "22023") return NOT_SEALED;
    throw new Error(`가입 서명 요청을 만들지 못했다: ${started.error.code}`);
  }
  const row = firstRow(startRow, started.data);
  if (row.result === "too_many") return TOO_MANY;
  if (row.result === "too_many_day") return TOO_MANY_DAY;
  if (row.result === "method_refused") return CLOSED;
  // 브라우저가 고른 크리에이터 ID 가 이미 있다 — 새 값으로 다시 봉인하게
  if (row.result === "creator_taken") return NOT_SEALED;
  if (!row.request_id || !row.payload || !row.expires_at) throw new Error("가입 서명 요청 응답에 칸이 비었다");
  const requestId = row.request_id;

  const ask = () =>
    signer.requestSignature({ requestId, plaintext: row.payload!, requestMessage: LINK_REQUEST_MESSAGE, envelope, creatorId, phone, minAge: CREATOR_SIGN_MIN_AGE });
  let sent: SignRequestStart = await ask();
  // INV-U20: 장애면 한 번 더 불러 본다
  if (!sent.ok && sent.down) sent = await ask();
  if (!sent.ok) {
    if (sent.down) {
      // 두 번 다 장애 — 그 번호표에 「창구 장애 확인」. 적지 못하면 6자리 길을 열지 않는다(막힌 쪽)
      return (await close(deps, ticket, requestId, "down")) ? { ok: true, state: "down", ticket } : CLOSED;
    }
    await close(deps, ticket, requestId, "failed");
    return NOT_ACCEPTED;
  }
  const recorded = await deps.admin.rpc("record_signup_sign_tx", { p_ticket: ticket, p_request_id: requestId, p_tx_id: sent.txId });
  if (recorded.error || recorded.data !== "recorded") {
    if (recorded.error) console.error(`가입 서명 거래 ID 를 적지 못했다: ${recorded.error.code ?? "코드 없음"}`);
    await close(deps, ticket, requestId, "failed");
    return CLOSED;
  }
  return { ok: true, state: "pending", ticket, requestId, expiresAt: row.expires_at };
}

/** 본문: { requestId }. ticket: 쿠키의 번호표(본문에서 읽지 않는다). */
export async function checkCreatorSign(deps: CreatorSignDeps, body: unknown, ticket: string | null): Promise<CheckCreatorSignResult> {
  if (!deps.signer) return CLOSED;
  const parsed = checkBody.safeParse(body);
  const t = ticketSchema.safeParse(ticket);
  if (!parsed.success || !t.success) return NOT_FOUND;
  const requestId = parsed.data.requestId;
  const signer = deps.signer;

  const read = await deps.admin.rpc("signup_sign_request", { p_ticket: t.data, p_request_id: requestId });
  if (read.error) {
    if (read.error.code && MISSING_FUNCTION.has(read.error.code)) return CLOSED;
    throw new Error(`가입 서명 요청을 읽지 못했다: ${read.error.code}`);
  }
  const req = firstRow(requestRow, read.data);
  if (req.state === "not_found") return NOT_FOUND;
  if (req.state === "expired") return { ok: true, state: "failed" };
  if (req.state !== "pending") return { ok: true, state: req.state };
  if (!req.payload) throw new Error("기다리는 가입 서명 요청에 원문이 없다");
  // 거래 ID 가 아직 없다 — 요청을 보내는 중이다
  if (!req.gateway_tx_id) return { ok: true, state: "pending" };

  const askResult = () => signer.signatureResult({ requestId, txId: req.gateway_tx_id!, plaintext: req.payload! });
  let res: SignatureResult = await askResult();
  if (res.state === "unavailable") res = await askResult();
  if (res.state === "unavailable") {
    // INV-U20 정함: 결과 조회만 실패해도 장애로 본다
    return (await close(deps, t.data, requestId, "down")) ? { ok: true, state: "down" } : { ok: true, state: "pending" };
  }
  if (res.state === "pending") return { ok: true, state: "pending" };
  // INV-S2: 서명된 원문이 저장 원문과 같고 방식이 이 창구의 방식일 때만 signed. 거절·기한·불일치는 실패(장애 아님)
  const signed = res.state === "signed" && res.method === signer.kind && sameSignedPlaintext(req.payload, res.signedPlaintext);
  const settled = await deps.admin.rpc("settle_signup_sign", {
    p_ticket: t.data,
    p_request_id: requestId,
    p_outcome: signed ? "signed" : "failed",
    p_signed_content: signed && res.state === "signed" ? res.signedPlaintext : null,
    p_method: signer.kind,
  });
  if (settled.error) throw new Error(`가입 서명 결과를 적지 못했다: ${settled.error.code}`);
  const out = firstRow(settleRow, settled.data);
  if (out.result === "not_found") return NOT_FOUND;
  if (out.result === "method_refused") return CLOSED;
  if (out.result === "expired") return { ok: true, state: "failed" };
  return { ok: true, state: out.result };
}
