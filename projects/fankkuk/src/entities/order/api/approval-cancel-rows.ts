import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ApprovalCancelTarget } from "../model/approval-cancel";

// 승인 취소 화면 값 읽기 (approval-cancel INV-AC1·AC4·AC5). DB 함수 my_approval_cancel_targets 는 앱 서버 키 전용 —
// 넘기는 사람 ID 는 세션에서 확인한 사람뿐이다(승인 서명 요청과 같은 방식). 함수가 그 크리에이터의 승인된 진행 중 주문만 돌려준다.

const rowSchema = z.object({
  request_id: z.string().regex(/^apr_[0-9A-Za-z]{1,40}$/),
  order_no: z.string().min(1),
  cancelable: z.boolean(),
  arrived_box_count: z.number().int().nonnegative(),
  box_count: z.number().int().positive(),
  approval_deadline_at: z.string().min(1),
});

export function parseApprovalCancelTargets(rows: unknown): ApprovalCancelTarget[] {
  return z
    .array(rowSchema)
    .parse(rows)
    .map((r) => ({
      requestId: r.request_id,
      orderNo: r.order_no,
      cancelable: r.cancelable,
      arrivedBoxCount: r.arrived_box_count,
      boxCount: r.box_count,
      approvalDeadlineAt: new Date(r.approval_deadline_at).toISOString(),
    }));
}

/** actorId 는 세션에서 확인한 사람 ID(readViewer)만 넘긴다 */
export async function readApprovalCancelTargets(admin: Pick<SupabaseClient, "rpc">, actorId: string): Promise<ApprovalCancelTarget[]> {
  const { data, error } = await admin.rpc("my_approval_cancel_targets", { p_actor_id: actorId });
  if (error) throw new Error(`승인 취소 대상을 읽지 못했다: ${error.code}`);
  return parseApprovalCancelTargets(data);
}
