import type { JsonReply } from "@/shared/lib/http/private-json";
import { refuseScheduleRequest, type ScheduleRequest } from "@/shared/lib/http/schedule-secret";
import type { DispatchResult } from "./dispatch-notifications";

// 예약 발송 입구 (notifications INV-N16). DB 예약 작업이 5분마다 부르고, 운영자의 「알림 지금 보내기」와 같은 일꾼을 한 번 돌린다.
// 로그인 대신 서버 설정의 비밀 값이 「Authorization: Bearer <값>」으로 같이 와야 일한다 — 판정은 shared/lib/http/schedule-secret
// (결제 다시 확인 예약 입구와 같은 문지기). 비밀 값이 없거나 짧으면 404, 다르면 401, 본문에 칸이 있으면 400 —
// 무엇을 누구에게 보낼지는 발송 대기 줄이 이미 정했다(INV-N3).

export async function runScheduledDispatch(input: ScheduleRequest, dispatch: () => Promise<DispatchResult>): Promise<JsonReply> {
  const refused = refuseScheduleRequest(input);
  if (refused) return refused;
  const result = await dispatch();
  if (!result.ok) return { status: 500, body: { message: "알림을 보내지 못했어요.", counts: result.counts } };
  return { status: 200, body: { counts: result.counts } };
}
