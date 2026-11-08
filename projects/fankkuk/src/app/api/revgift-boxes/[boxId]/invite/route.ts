import { readViewer } from "@/entities/session/model/viewer";
import { renewInvite } from "@/features/revgift-box-manage/model/box-manage";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 초대 링크 다시 만들기 (revgift-box INV-GB3, 정할 것 Q3). 옛 링크는 그 순간 무효가 된다.
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async () => {
    const supabase = await createRequestSupabase();
    const r = await renewInvite({ client: supabase, viewer: await readViewer(supabase) }, boxId);
    return r.ok ? { status: 200, body: { token: r.token } } : { status: r.status, body: { message: r.message } };
  });
}
