import { readViewer } from "@/entities/session/model/viewer";
import { approveGift } from "@/features/approval-request/model/approve-gift";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 승인 (approval-signature INV-S11·S12). 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다.
// 승인하는 사람은 세션에서 확인한 사람이다(INV-L2). 원문 읽기와 승인은 관리자 키로 부르되, 넘기는 사람 ID 는 세션에서 확인한 것뿐이다(INV-L3).
// 서명 창구는 운영에서 없다 — 카카오 연결 전에는 운영에서 승인을 받지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    const result = await approveGift({ admin: createAdminSupabase(), viewer, signer: chooseApprovalSigner(process.env) }, body);
    if (result.ok) return { status: 200, body: {} };
    // code 는 화면이 갈래를 나눌 실패에만 붙는다(no_address — INV-S13)
    return { status: result.status, body: result.code ? { message: result.message, code: result.code } : { message: result.message } };
  });
}
