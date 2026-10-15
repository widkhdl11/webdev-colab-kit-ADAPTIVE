import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { saveFanIntro } from "@/features/fan-profile-edit/model/save-fan-intro";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬 자기소개 저장 (my-account INV-A12). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(INV-A6 과 같은 겉껍데기).
// 사람은 세션에서 확인한 팬이고, DB 도 로그인 토큰으로 다시 확인한다 — 본문의 계정 ID 는 읽지 않는다.
// 닉네임은 이 라우트가 아니라 내 정보 저장(/api/me)으로 바뀐다(INV-A12 — 닉네임 규칙을 새로 만들지 않는다).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await saveFanIntro({ client: supabase, viewer: await readViewer(supabase) }, body);
    if (result.ok) return { status: 200, body: { intro: result.intro } };
    return { status: result.status, body: { message: result.message } };
  });
}
