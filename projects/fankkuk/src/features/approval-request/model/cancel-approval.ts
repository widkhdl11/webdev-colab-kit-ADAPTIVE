import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ApprovalCancelPhase } from "@/entities/order/model/approval-cancel";
import type { Viewer } from "@/entities/session/model/viewer";

// 승인 취소 저장 (approval-cancel INV-AC1~AC5).
// 본문에서 승인 요청 ID 하나만 꺼낸다. 누가 취소하는지는 세션에서 확인한 사람이고(INV-L2), DB 함수는 관리자 키로 부르되
// 넘기는 사람 ID 는 그 사람뿐이다(INV-L3 — 승인 서명 요청과 같은 방식). DB 가 그 주문의 크리에이터인지·입고 전/뒤·송장 출력 여부를
// 주문 줄을 잠근 자리에서 다시 판정한다 — 화면이 본 「도착한 상자 수」는 보내지도 읽지도 않는다(INV-AC1).
// 카카오 서명은 없다 — 취소는 주소를 닫는 쪽이다(INV-AC5).

const bodySchema = z.object({ requestId: z.string().regex(/^apr_[0-9A-Za-z]{1,40}$/) });

const replyRow = z.object({
  result: z.enum(["canceled", "not_found", "not_approved", "printed", "not_cancelable"]),
  phase: z.enum(["before_inbound", "after_inbound"]).nullable(),
});

/** ok 이면 서버가 정한 결과 — 화면은 이것으로 「대기로 돌아감」·「거절로 끝남」을 보인다(창을 연 사이 상자가 오면 서버 판정이 이긴다). */
export type CancelApprovalResult =
  | { ok: true; phase: ApprovalCancelPhase }
  | { ok: false; status: 400 | 401 | 403 | 404 | 409; message: string; code?: "printed" };

type Deps = { admin: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export async function cancelApproval(deps: Deps, body: unknown): Promise<CancelApprovalResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 이용할 수 있습니다." };
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "잘못된 요청입니다." };

  const { data, error } = await deps.admin.rpc("cancel_approval", { p_actor_id: deps.viewer.userId, p_request_id: parsed.data.requestId });
  if (error) throw new Error(`승인 취소를 저장하지 못했다: ${error.code}`);
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  const row = replyRow.parse(Array.isArray(data) ? data[0] : data);
  if (row.result === "not_found") return { ok: false, status: 404, message: "승인 요청을 찾을 수 없습니다." };
  if (row.result === "not_approved") return { ok: false, status: 409, message: "이미 처리된 요청입니다. 새로고침해 결과를 확인해 주세요." };
  // INV-AC4: 첫 송장 출력 뒤에는 1:1 문의로
  if (row.result === "printed") return { ok: false, status: 409, message: "송장이 이미 출력돼 승인을 취소할 수 없습니다. 1:1 문의로 알려 주세요.", code: "printed" };
  if (row.result === "not_cancelable") return { ok: false, status: 409, message: "현재 승인을 취소할 수 없는 선물입니다. 새로고침해 주세요." };
  if (row.phase === null) throw new Error("승인 취소 응답에 입고 전/뒤가 없다");
  return { ok: true, phase: row.phase };
}
