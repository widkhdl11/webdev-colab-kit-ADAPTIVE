import { readViewer } from "@/entities/session/model/viewer";
import { saveCreatorHandle } from "@/features/creator-settings-save/model/save-creator-settings";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 링크용 아이디 저장(creator-link INV-E1~E4). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 사람은 세션에서 확인한 사람이고, DB 도 로그인 토큰으로 크리에이터를 다시 정한다 — 크리에이터 ID 는 받지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await saveCreatorHandle({ client: supabase, viewer: await readViewer(supabase) }, body);
    return result.ok ? { status: 200, body: { handle: result.handle } } : { status: result.status, body: { message: result.message } };
  });
}
