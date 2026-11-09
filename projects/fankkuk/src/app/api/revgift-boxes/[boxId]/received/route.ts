import { readViewer } from "@/entities/session/model/viewer";
import { confirmBoxReceived } from "@/features/revgift-box-apply/model/box-apply";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 선물함 선물의 [받았어요] — 받는 팬 본인만, 출고 뒤에만(delivery-status INV-DS2·DS6). 판정은 DB 함수가 로그인 토큰으로 한다.
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async () => {
    const supabase = await createRequestSupabase();
    const r = await confirmBoxReceived({ client: supabase, viewer: await readViewer(supabase) }, boxId);
    return r.ok ? { status: 200, body: {} } : { status: r.status, body: { message: r.message } };
  });
}
