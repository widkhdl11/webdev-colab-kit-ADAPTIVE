import { NextResponse } from "next/server";
import { sessionActivityOf } from "@/entities/session/api/session-activity";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { readSessionClock } from "@/features/auth/model/session-clock";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";

// 운영자 화면이 「곧 로그아웃됩니다」를 보이기 전에 묻는 끝나는 시각 (session-login INV-L19).
// 이 요청은 사용으로 치지 않는다 — proxy 가 마지막 사용 시각을 고치지 않는 경로다. 읽기만 하므로 같은 출처 확인은 걸지 않는다(본문 없음·응답은 내 세션 시각뿐).

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const supabase = await createRequestSupabase();
  if (!(await readVerifiedUserId(supabase.auth))) return NextResponse.json({ ended: true }, { headers: NO_STORE });
  const clock = await readSessionClock(supabase.auth, sessionActivityOf(createAdminSupabase()));
  return NextResponse.json(clock ?? { ended: true }, { headers: NO_STORE });
}
