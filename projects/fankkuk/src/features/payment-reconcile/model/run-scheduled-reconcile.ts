import type { JsonReply } from "@/shared/lib/http/private-json";
import { refuseScheduleRequest, type ScheduleRequest } from "@/shared/lib/http/schedule-secret";
import type { ReconcileResult } from "./reconcile-payments";

// 결제 다시 확인 예약 입구 (payment INV-M19 S19g). DB 예약 작업(fankkuk-reconcile)이 5분마다 부른다.
// 알림 예약 입구(notifications INV-N16)와 같은 문지기 — 비밀 값이 없거나 짧으면 404, 다르면 401, 본문에 칸이 있으면 400.
// 들여보내지 않으면 다시 확인(결제사 조회)을 부르지 않는다. 언제나 전부(주문번호 없이)를 본다.

export async function runScheduledReconcile(input: ScheduleRequest, reconcile: (orderNo: string | null) => Promise<ReconcileResult>): Promise<JsonReply> {
  const refused = refuseScheduleRequest(input);
  if (refused) return refused;
  const result = await reconcile(null);
  if (!result.ok) return { status: 500, body: { message: "결제를 다시 확인하지 못한 줄이 있어요.", counts: result.counts } };
  return { status: 200, body: { counts: result.counts } };
}
