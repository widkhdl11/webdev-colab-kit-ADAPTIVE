import { readViewer } from "@/entities/session/model/viewer";
import { resolveHold } from "@/features/revgift-box-manage/model/box-intake";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 확인 필요 선물의 팬 고르기 (revgift-box INV-GB12). 그 선물함의 담길 신청만 — DB 가 주인·선물함을 판정한다.
export async function POST(req: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await resolveHold({ client: supabase, viewer: await readViewer(supabase) }, cardId, body);
    return r.ok ? { status: 200, body: { ok: true } } : { status: r.status, body: { message: r.message } };
  });
}
