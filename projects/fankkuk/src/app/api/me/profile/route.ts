import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { saveFanProfile } from "@/features/fan-profile-edit/model/save-fan-profile";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬 프로필 글 저장 — 자기소개·닉네임을 한 처리로 (my-account INV-A12). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(INV-A6 과 같은 겉껍데기).
// 사람은 세션에서 확인한 팬이고, DB 도 로그인 토큰으로 다시 확인한다 — 본문의 계정 ID 는 읽지 않는다.
// 닉네임 판정은 내 정보 고치기와 같은 DB 판정(nickname_problem·유일 인덱스)을 쓴다 — 닉네임 규칙을 새로 만들지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await saveFanProfile({ client: supabase, viewer: await readViewer(supabase) }, body);
    if (result.ok) return { status: 200, body: { intro: result.intro, nickname: result.nickname } };
    return { status: result.status, body: result.field ? { field: result.field, message: result.message } : { message: result.message } };
  });
}
