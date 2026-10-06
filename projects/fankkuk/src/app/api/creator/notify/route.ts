import { readViewer } from "@/entities/session/model/viewer";
import { saveCreatorNotify } from "@/features/creator-settings-save/model/save-creator-settings";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터 알림 두 칸(카카오·이메일) 저장. 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(my-account INV-A11 — INV-A6 과 같다).
// 승인 요청과 그 재알림은 두 칸이 꺼져도 간다(notifications INV-N6) — 그것을 끄는 칸은 받지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await saveCreatorNotify({ client: supabase, viewer: await readViewer(supabase) }, body);
    return result.ok ? { status: 200, body: { saved: true } } : { status: result.status, body: { message: result.message } };
  });
}
