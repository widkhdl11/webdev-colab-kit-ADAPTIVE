import type { NextRequest } from "next/server";
import { runScheduledReconcile } from "@/features/payment-reconcile/model/run-scheduled-reconcile";
import { refuseScheduleRequest } from "@/shared/lib/http/schedule-secret";
import { runServerReconcile } from "./reconciler";

// 결제 다시 확인 예약 입구 (payment INV-M19 S19g). DB 예약 작업(pg_net, fankkuk-reconcile)이 5분마다 부른다 —
// 알림 예약 입구(api/cron/notifications)와 같은 방식: 로그인 대신 서버 설정 FANKKUK_SCHEDULE_SECRET 와 같은 Bearer 값을 본다.
// 결제사 조회는 줄마다 10초 제한 — 함수 시간은 60초로 둔다(DB 쪽 요청 제한도 60초). 다 못 본 줄은 다음 회차가 본다.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const secret = process.env.FANKKUK_SCHEDULE_SECRET;
  const authorization = req.headers.get("authorization");
  // 비밀 값 판정이 먼저다 — 거부할 요청의 본문은 읽지도 않는다(본문 칸 판정은 아래 runScheduledReconcile 이 다시 한다)
  const refused = refuseScheduleRequest({ secret, authorization, body: {} });
  if (refused) return Response.json(refused.body, { status: refused.status, headers: NO_STORE });

  // 빈 본문은 칸 없음({})으로, 깨진 JSON 은 null 로 넘겨 400 이 되게 한다
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    body = null;
  }
  const reply = await runScheduledReconcile(
    { secret, authorization, body },
    runServerReconcile,
  ).catch((e: unknown) => {
    console.error("cron/payments: 처리 중 예외", e instanceof Error ? e.name : typeof e);
    return { status: 500, body: { message: "처리하지 못했어요." } };
  });
  return Response.json(reply.body, { status: reply.status, headers: NO_STORE });
}
