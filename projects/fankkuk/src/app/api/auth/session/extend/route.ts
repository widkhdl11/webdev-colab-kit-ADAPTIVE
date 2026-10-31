import { NextResponse, type NextRequest } from "next/server";
import { sessionActivityOf } from "@/entities/session/api/session-activity";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { extendSession } from "@/features/auth/model/session-clock";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { isSameOriginJson } from "@/shared/lib/http/same-origin";

// 운영자 화면의 [연장] (session-login INV-L19). 내 세션의 마지막 사용 시각을 지금으로 고치고 새 끝나는 시각을 돌려준다 — 절대 기간은 늘지 않는다.
// 사람·세션은 요청 쿠키의 로그인 토큰이 정한다(INV-L2). 같은 사이트의 JSON 요청만 받는다.

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest) {
  if (!isSameOriginJson(req.headers)) {
    return NextResponse.json({ message: "유효하지 않은 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." }, { status: 403, headers: NO_STORE });
  }
  const supabase = await createRequestSupabase();
  if (!(await readVerifiedUserId(supabase.auth))) return NextResponse.json({ ended: true }, { status: 401, headers: NO_STORE });
  const clock = await extendSession(supabase.auth, sessionActivityOf(createAdminSupabase()));
  return NextResponse.json(clock ?? { ended: true }, { status: clock ? 200 : 401, headers: NO_STORE });
}
