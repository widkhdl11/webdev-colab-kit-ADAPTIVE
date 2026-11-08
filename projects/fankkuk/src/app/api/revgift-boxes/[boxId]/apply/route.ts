import { readViewer } from "@/entities/session/model/viewer";
import { applyBox } from "@/features/revgift-box-apply/model/box-apply";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 선물함 신청 (revgift-box INV-GB4·GB5·GB6). 본문은 초대 토큰뿐 — 주소는 팬이 등록한 받을 주소를 DB 신청 함수가 복사한다. 등록 주소가 없으면 422(reason: no_address).
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await applyBox({ client: supabase, viewer: await readViewer(supabase) }, boxId, body);
    return r.ok ? { status: 200, body: {} } : { status: r.status, body: { message: r.message, reason: "reason" in r ? r.reason : undefined } };
  });
}
