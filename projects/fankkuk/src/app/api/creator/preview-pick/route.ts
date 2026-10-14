import { readViewer } from "@/entities/session/model/viewer";
import { savePreviewPick } from "@/features/creator-settings-save/model/save-creator-settings";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 링크 미리보기 이미지 고르기 저장(creator-link INV-E1·E10). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 사람은 세션에서 확인한 사람이고, DB 도 로그인 토큰으로 크리에이터를 다시 정한다 — 크리에이터 ID 는 받지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await savePreviewPick({ client: supabase, viewer: await readViewer(supabase) }, body);
    return result.ok ? { status: 200, body: { ok: true } } : { status: result.status, body: { message: result.message } };
  });
}
