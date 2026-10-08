import type { NextRequest } from "next/server";
import { runServerDispatcher } from "@/features/notification-dispatch/api/server-dispatcher";
import { runScheduledDispatch } from "@/features/notification-dispatch/model/run-scheduled-dispatch";

// 예약 발송 입구 (notifications INV-N16). DB 예약 작업(pg_net)이 5분마다 부른다 — 같은 사이트 요청이 아니라 로그인 대신
// 서버 설정 FANKKUK_SCHEDULE_SECRET 와 같은 Bearer 값을 본다. 일꾼은 「알림 지금 보내기」와 같다(server-dispatcher).
// 일꾼의 시간 예산은 30초(줄마다 확인) — 함수 시간은 거기에 메일 한 통의 시간 제한을 더한 60초로 둔다(DB 쪽 요청 제한도 60초).
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  // 빈 본문은 칸 없음({})으로, 깨진 JSON 은 null 로 넘겨 400 이 되게 한다
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    body = null;
  }
  const reply = await runScheduledDispatch(
    { secret: process.env.FANKKUK_SCHEDULE_SECRET, authorization: req.headers.get("authorization"), body },
    runServerDispatcher,
  ).catch((e: unknown) => {
    console.error("cron/notifications: 처리 중 예외", e instanceof Error ? e.name : typeof e);
    return { status: 500, body: { message: "처리하지 못했어요." } };
  });
  return Response.json(reply.body, { status: reply.status, headers: NO_STORE });
}
