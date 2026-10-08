import type { NextRequest } from "next/server";
import { runServerDispatcher } from "@/features/notification-dispatch/api/server-dispatcher";
import { runDispatch } from "@/features/notification-dispatch/model/run-dispatch";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 알림 지금 보내기 (notifications INV-N5·N11). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 운영자 판정은 로그인한 사람의 세션으로, 일꾼은 관리자 키로 — 일꾼 함수는 앱 서버 키만 실행할 수 있다.
// 일꾼은 5분마다의 예약 발송 입구와 같다(server-dispatcher). 함수 시간은 일꾼 예산 30초 + 메일 한 통의 시간 제한.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => runDispatch(await createRequestSupabase(), body, runServerDispatcher));
}
