import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkApprovalSignature } from "@/entities/order/model/evaluate-approval";
import type { Viewer } from "@/entities/session/model/viewer";
import type { ApprovalSigner } from "@/shared/api/approval-signer/signer";

// 승인 저장 (approval-signature INV-S11·S12, 카드 d28).
// 흐름: 승인 요청 → 본인 확인 결과 수신(서명 창구 — 로컬은 가짜) → 승인 처리. 가운데 칸만 창구마다 다르다.
// 승인하는 사람은 세션에서 확인한 사람이다(INV-L2·L3). 본문에서는 요청 식별값 하나만 꺼낸다 — 사람·서명 칸은 읽지 않는다.
// 원문은 그 주문의 크리에이터일 때만 DB 가 돌려주고, 승인 함수가 같은 확인과 원문 일치를 한 번 더 본 뒤 서명과 승인을 한 처리에서 저장한다.

const inputSchema = z.object({ requestId: z.string().regex(/^apr_[0-9A-Za-z]{1,40}$/) });
const resultSchema = z.enum(["approved", "already", "not_approvable", "not_found", "signature_mismatch"]);

export type ApproveGiftResult = { ok: true } | { ok: false; status: 400 | 401 | 403 | 404 | 409 | 503; message: string };

const NOT_FOUND = { ok: false, status: 404, message: "찾을 수 없는 요청이에요." } as const;

export async function approveGift(
  deps: { admin: Pick<SupabaseClient, "rpc">; viewer: Viewer | null; signer: ApprovalSigner | null },
  body: unknown,
): Promise<ApproveGiftResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 할 수 있어요." };
  // INV-S11: 창구가 없으면(운영, 카카오 연결 전) 승인을 받지 않는다 — 가짜로 넘어가지 않는다
  if (!deps.signer) return { ok: false, status: 503, message: "지금은 승인할 수 없어요. 잠시 뒤 다시 해 주세요." };

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "잘못된 요청이에요." };
  const requestId = parsed.data.requestId;
  const actorId = deps.viewer.userId;

  const payloadRead = await deps.admin.rpc("approval_payload_of", { p_request_id: requestId, p_actor_id: actorId });
  if (payloadRead.error) throw new Error(`승인 원문을 읽지 못했다: ${payloadRead.error.code}`);
  const storedPayload = payloadRead.data;
  if (typeof storedPayload !== "string" || storedPayload === "") return NOT_FOUND;

  const signature = await deps.signer.sign({ storedPayload, creatorUserId: actorId });
  // INV-S2·S4: 원문 일치와 본인 일치를 진짜 서명과 같은 판정으로 본다
  const check = checkApprovalSignature(storedPayload, signature, deps.signer.registeredSignerIdOf(actorId));
  if (!check.ok) return { ok: false, status: 409, message: "서명을 확인하지 못했어요. 다시 해 주세요." };

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
  if (result === "already") return { ok: false, status: 409, message: "이미 처리된 요청이에요. 새로 고침하면 결과가 보여요." };
  if (result === "not_approvable") return { ok: false, status: 409, message: "지금은 승인할 수 없는 선물이에요. 새로 고침해 주세요." };
  return { ok: false, status: 409, message: "서명을 확인하지 못했어요. 다시 해 주세요." };
}
