import { readViewer } from "@/entities/session/model/viewer";
import { chooseCancelledArrival } from "@/features/revgift-box-manage/model/box-intake";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 취소한 선물함의 상자 — 선물함 다시 열기 · 돌려받기 (revgift-box INV-GB23). 주인 본인만, 한 번만.
export async function POST(req: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await chooseCancelledArrival({ client: supabase, viewer: await readViewer(supabase) }, cardId, body);
    return r.ok ? { status: 200, body: { ok: true } } : { status: r.status, body: { message: r.message } };
  });
}
