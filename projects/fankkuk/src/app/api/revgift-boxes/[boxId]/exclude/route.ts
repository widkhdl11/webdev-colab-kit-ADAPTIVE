import { readViewer } from "@/entities/session/model/viewer";
import { setExcluded } from "@/features/revgift-box-manage/model/box-manage";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 신청 줄 제외·다시 넣기 (revgift-box INV-GB5·GB7). 주인인지·open 인지·받을 인원은 DB 함수가 선물함 줄을 잠근 뒤 판정한다.
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await setExcluded({ client: supabase, viewer: await readViewer(supabase) }, boxId, body);
    return r.ok ? { status: 200, body: { status: r.status } } : { status: r.status, body: { message: r.message } };
  });
}
