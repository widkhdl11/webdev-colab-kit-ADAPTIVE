import { readViewer } from "@/entities/session/model/viewer";
import { saveReplyConsent } from "@/features/gift-reply/model/gift-reply-actions";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 답장 공개 동의(「공개해도 괜찮아요」·「닉네임도 보이기」) — gift-reply INV-G8. 그 선물을 보낸 사람 본인만(DB 가 로그인 토큰으로 확인).
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await saveReplyConsent({ client: supabase, viewer: await readViewer(supabase) }, body);
    return r.ok ? { status: 200, body: { saved: true } } : { status: r.status, body: { message: r.message } };
  });
}
