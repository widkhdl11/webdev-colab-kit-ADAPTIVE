import { readViewer } from "@/entities/session/model/viewer";
import { closeBox } from "@/features/revgift-box-manage/model/box-manage";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 마감 (revgift-box INV-GB8). 제외 안 된 신청과 고른 대기 신청은 담길 차례가 되고, 제외된 신청·고르지 않은 대기 신청의 주소 사본은
// 같은 처리에서 지워진다(INV-GB7). 본문: { waitlisted: 대기 신청 번호[] } — 비어도 된다(0명 마감 포함).
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await closeBox({ client: supabase, viewer: await readViewer(supabase) }, boxId, body);
    return r.ok ? { status: 200, body: { selected: r.selected } } : { status: r.status, body: { message: r.message } };
  });
}
