import { readViewer } from "@/entities/session/model/viewer";
import { deleteGiftReply } from "@/features/gift-reply/model/gift-reply-actions";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 답장 지우기 — gift-reply INV-G4. 받은 크리에이터 본인만(DB 가 로그인 토큰으로 확인). 지운 상자에는 다시 쓰지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await deleteGiftReply({ client: supabase, viewer: await readViewer(supabase) }, body);
    return r.ok ? { status: 200, body: { deleted: true } } : { status: r.status, body: { message: r.message } };
  });
}
