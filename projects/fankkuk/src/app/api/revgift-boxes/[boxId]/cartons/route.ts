import { readViewer } from "@/entities/session/model/viewer";
import { setCartonCount } from "@/features/revgift-box-manage/model/box-intake";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 3페이지 보낸 상자 수 (revgift-box INV-GB11, 정할 것 Q8) — 첫 상자 입고 전까지만.
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await setCartonCount({ client: supabase, viewer: await readViewer(supabase) }, boxId, body);
    return r.ok ? { status: 200, body: { ok: true } } : { status: r.status, body: { message: r.message } };
  });
}
