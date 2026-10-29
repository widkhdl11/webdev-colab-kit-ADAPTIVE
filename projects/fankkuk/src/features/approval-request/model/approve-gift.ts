import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { APPROVAL_EXPIRED_MESSAGE } from "@/entities/order/config/approval-deadline";
import { checkApprovalSignature } from "@/entities/order/model/evaluate-approval";
import type { Viewer } from "@/entities/session/model/viewer";
import type { ApprovalSigner } from "@/shared/api/approval-signer/signer";

// 승인 저장 (approval-signature INV-S11·S12, 카드 d28).
// 흐름: 승인 요청 → 본인 확인 결과 수신(서명 창구 — 로컬은 가짜) → 승인 처리. 가운데 칸만 창구마다 다르다.
// 승인하는 사람은 세션에서 확인한 사람이다(INV-L2·L3). 본문에서는 요청 식별값 하나만 꺼낸다 — 사람·서명 칸은 읽지 않는다.
// 받는 주소가 없으면 DB 가 승인하지 않는다(INV-S13) — 화면이 승인 전에 주소 입력을 먼저 띄우므로 여기 닿는 것은 그 사이에 어긋난 경우뿐이다.
// 원문은 그 주문의 크리에이터일 때만 DB 가 돌려주고, 승인 함수가 같은 확인과 원문 일치를 한 번 더 본 뒤 서명과 승인을 한 처리에서 저장한다.

const inputSchema = z.object({ requestId: z.string().regex(/^apr_[0-9A-Za-z]{1,40}$/) });
const resultSchema = z.enum(["approved", "already", "not_approvable", "expired", "not_found", "signature_mismatch", "no_address"]);

/** code: 화면이 갈래를 나눌 실패 — no_address 면 승인 창이 주소 입력으로 돌아간다(INV-S13) */
export type ApproveGiftResult = { ok: true } | { ok: false; status: 400 | 401 | 403 | 404 | 409 | 503; message: string; code?: "no_address" };

const NOT_FOUND = { ok: false, status: 404, message: "승인 요청을 찾을 수 없습니다." } as const;

export async function approveGift(
  deps: { admin: Pick<SupabaseClient, "rpc">; viewer: Viewer | null; signer: ApprovalSigner | null },
  body: unknown,
): Promise<ApproveGiftResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 이용할 수 있습니다." };
  // INV-S11: 창구가 없으면(운영, 카카오 연결 전) 승인을 받지 않는다 — 가짜로 넘어가지 않는다
  if (!deps.signer) return { ok: false, status: 503, message: "현재 승인할 수 없습니다. 잠시 후 다시 시도해 주세요." };

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "잘못된 요청입니다." };
  const requestId = parsed.data.requestId;
  const actorId = deps.viewer.userId;

  const payloadRead = await deps.admin.rpc("approval_payload_of", { p_request_id: requestId, p_actor_id: actorId });
  if (payloadRead.error) throw new Error(`승인 원문을 읽지 못했다: ${payloadRead.error.code}`);
  const storedPayload = payloadRead.data;
  if (typeof storedPayload !== "string" || storedPayload === "") return NOT_FOUND;

  const signature = await deps.signer.sign({ storedPayload, creatorUserId: actorId });
  // INV-S2·S4: 원문 일치와 본인 일치를 진짜 서명과 같은 판정으로 본다
  const check = checkApprovalSignature(storedPayload, signature, deps.signer.registeredSignerIdOf(actorId));
  if (!check.ok) return { ok: false, status: 409, message: "서명을 확인하지 못했습니다. 다시 인증해 주세요." };

  const { data, error } = await deps.admin.rpc("approve_request", {
    p_request_id: requestId,
    p_actor_id: actorId,
    p_signed_content: new TextDecoder().decode(signature.signedContent),
    p_signer_id: signature.signerId,
    p_method: deps.signer.kind,
  });
  if (error) throw new Error(`승인을 저장하지 못했다: ${error.code}`);
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  const result = resultSchema.parse(data);
  if (result === "approved") return { ok: true };
  if (result === "not_found") return NOT_FOUND;
  if (result === "already") return { ok: false, status: 409, message: "이미 처리된 요청입니다. 새로고침해 결과를 확인해 주세요." };
  // INV-S6: 168시간이 지났으면 자동 처리 전이라도 승인하지 않는다 — 거절과 같은 문구
  if (result === "expired") return { ok: false, status: 409, message: APPROVAL_EXPIRED_MESSAGE };
  if (result === "no_address") return { ok: false, status: 409, message: "받는 주소를 먼저 등록해 주세요.", code: "no_address" };
  if (result === "not_approvable") return { ok: false, status: 409, message: "현재 승인할 수 없는 선물입니다. 새로고침해 주세요." };
  return { ok: false, status: 409, message: "서명을 확인하지 못했습니다. 다시 인증해 주세요." };
}
