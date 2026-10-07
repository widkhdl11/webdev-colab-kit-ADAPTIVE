import { readViewer } from "@/entities/session/model/viewer";
import { saveCreatorTags } from "@/features/creator-tags-edit/model/save-creator-tags";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터 태그 저장(creator-tags INV-T2·T3). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(프로필 저장과 같다).
// 사람은 세션에서 확인한 사람이고, DB 도 로그인 토큰으로 크리에이터를 다시 정한다 — 관리자 키를 쓰지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await saveCreatorTags({ client: supabase, viewer: await readViewer(supabase) }, body);
    return result.ok ? { status: 200, body: { saved: true } } : { status: result.status, body: { message: result.message } };
  });
}
