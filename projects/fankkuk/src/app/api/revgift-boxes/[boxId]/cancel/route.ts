import { readViewer } from "@/entities/session/model/viewer";
import { cancelBox } from "@/features/revgift-box-manage/model/box-manage";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 선물함 취소 (revgift-box INV-GB1, 정할 것 Q9). 큰 상자가 입고되기 전까지. 신청의 주소 사본은 같은 처리에서 모두 지워진다.
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async () => {
    const supabase = await createRequestSupabase();
    const r = await cancelBox({ client: supabase, viewer: await readViewer(supabase) }, boxId);
    return r.ok ? { status: 200, body: {} } : { status: r.status, body: { message: r.message } };
  });
}
