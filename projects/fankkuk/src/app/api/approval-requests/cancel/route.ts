import { readViewer } from "@/entities/session/model/viewer";
import { cancelApproval } from "@/features/approval-request/model/cancel-approval";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 승인 취소 (approval-cancel INV-AC1~AC5). 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다. 본문은 승인 요청 ID 하나.
// 취소하는 사람은 세션에서 확인한 사람이다(INV-L2). DB 함수는 관리자 키로 부르되 넘기는 사람 ID 는 세션에서 확인한 것뿐이다(INV-L3).
// 성공이면 { phase: "before_inbound" | "after_inbound" } — 서버가 처리하는 순간의 상자 기록으로 정한 결과.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    const r = await cancelApproval({ admin: createAdminSupabase(), viewer }, body);
    if (r.ok) return { status: 200, body: { phase: r.phase } };
    return { status: r.status, body: r.code ? { message: r.message, code: r.code } : { message: r.message } };
  });
}
