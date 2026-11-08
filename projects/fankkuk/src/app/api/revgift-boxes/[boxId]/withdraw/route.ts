import { readViewer } from "@/entities/session/model/viewer";
import { withdrawBox } from "@/features/revgift-box-apply/model/box-apply";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 신청 취소 (revgift-box 정할 것 Q5). 신청 받는 중에만, 그 처리에서 주소 사본을 지운다.
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async () => {
    const supabase = await createRequestSupabase();
    const r = await withdrawBox({ client: supabase, viewer: await readViewer(supabase) }, boxId);
    return r.ok ? { status: 200, body: {} } : { status: r.status, body: { message: r.message } };
  });
}
