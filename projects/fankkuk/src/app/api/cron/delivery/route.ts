import type { NextRequest } from "next/server";
import { subscribePendingQuietly } from "@/features/delivery-tracking/api/server-deps";
import { refuseScheduleRequest } from "@/shared/lib/http/schedule-secret";

// 구독 대기 줄 보내기 예약 입구 (delivery-status INV-DS12). DB 예약 작업(pg_net)이 10분마다, 보낼 줄이 있을 때만 부른다.
// 문지기는 알림 예약 발송과 같다(FANKKUK_SCHEDULE_SECRET Bearer). 키가 없으면 보내지 않고 200 — 대기 줄은 그대로 남는다.
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    body = null;
  }
  const refused = refuseScheduleRequest({ secret: process.env.FANKKUK_SCHEDULE_SECRET, authorization: req.headers.get("authorization"), body });
  if (refused) return Response.json(refused.body, { status: refused.status, headers: NO_STORE });
  const outcome = await subscribePendingQuietly();
  if (!outcome) return Response.json({ message: "구독 대기 줄을 보내지 못했습니다." }, { status: 500, headers: NO_STORE });
  return Response.json(outcome, { status: 200, headers: NO_STORE });
}
