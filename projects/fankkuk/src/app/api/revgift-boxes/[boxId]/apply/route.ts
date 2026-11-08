import { readViewer } from "@/entities/session/model/viewer";
import { applyBox } from "@/features/revgift-box-apply/model/box-apply";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 선물함 신청 (revgift-box INV-GB4·GB5·GB6). 본문은 초대 토큰과 신청 폼에서 봉인한 주소·할증 구분뿐 — 봉인이 없거나 꼴이 틀리면 400(팬 등록 주소는 없다, 2026-11-08).
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await applyBox({ client: supabase, viewer: await readViewer(supabase) }, boxId, body);
    return r.ok ? { status: 200, body: {} } : { status: r.status, body: { message: r.message, reason: "reason" in r ? r.reason : undefined } };
  });
}
