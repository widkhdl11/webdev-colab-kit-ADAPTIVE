import type { NextRequest } from "next/server";
import { sweepPendingPhotoDeletions } from "@/entities/withdrawal/api/withdrawn-photos";
import { refuseScheduleRequest } from "@/shared/lib/http/schedule-secret";

// 탈퇴한 계정의 남은 사진 다시 지우기 (my-account INV-A15). DB 예약 작업(pg_net, schedule_photo_deletions)이 하루 한 번,
// 「지울 사진」 줄이 남았을 때만 부른다. 문지기는 다른 예약 입구와 같다(FANKKUK_SCHEDULE_SECRET Bearer).
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
  const outcome = await sweepPendingPhotoDeletions().catch(() => null);
  if (!outcome) return Response.json({ message: "남은 사진을 지우지 못했습니다." }, { status: 500, headers: NO_STORE });
  return Response.json(outcome, { status: 200, headers: NO_STORE });
}
