import { readViewer } from "@/entities/session/model/viewer";
import { submitTiers } from "@/features/revgift-box-manage/model/box-intake";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 2페이지 「다음」 (revgift-box INV-GB1·GB10). 선택된 신청 모두에 구간이 있어야 상자 보내 주세요로 가고, 같은 처리에서 6자리가 발급된다.
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await submitTiers({ client: supabase, viewer: await readViewer(supabase) }, boxId, body);
    return r.ok ? { status: 200, body: { ok: true } } : { status: r.status, body: { message: r.message } };
  });
}
