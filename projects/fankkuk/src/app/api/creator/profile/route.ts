import { readViewer } from "@/entities/session/model/viewer";
import { saveCreatorProfile } from "@/features/creator-settings-save/model/save-creator-settings";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터 공개 정보 저장(닉네임·소개글·찾기 노출 등 — 이름은 닉네임, creator-display-name INV-CN2). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(my-account INV-A9 — INV-A6 과 같다).
// 사람은 세션에서 확인한 사람이고(INV-L2), DB 도 로그인 토큰으로 크리에이터를 다시 정한다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await saveCreatorProfile({ client: supabase, viewer: await readViewer(supabase) }, body);
    return result.ok ? { status: 200, body: { saved: true } } : { status: result.status, body: { message: result.message } };
  });
}
