import { readViewer } from "@/entities/session/model/viewer";
import { confirmGiftBox } from "@/features/gift-reply/model/gift-reply-actions";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 받았어요(+선택 답장) — gift-reply INV-G1·G2·G3. 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 사람은 세션에서 확인한 사람이고, DB 도 로그인 토큰으로 그 상자를 받은 크리에이터인지 다시 확인한다 — 크리에이터 ID 는 받지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await confirmGiftBox({ client: supabase, viewer: await readViewer(supabase) }, body);
    return r.ok ? { status: 200, body: { result: r.result } } : { status: r.status, body: { message: r.message } };
  });
}
