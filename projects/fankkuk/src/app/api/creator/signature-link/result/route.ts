import { readViewer } from "@/entities/session/model/viewer";
import { checkSignatureLink } from "@/features/signature-link/model/signature-link";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 승인 서명 연결 결과 확인 (approval-signature INV-S16). 본문은 요청 ID 하나 — 결과는 서버가 서명 창구에 직접 묻고,
// 「연결됨」은 DB 가 서명된 원문을 저장한 원문과 대조해 통과했을 때만 적는다(S16c). 브라우저는 여기를 몇 초마다 부른다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    const r = await checkSignatureLink({ admin: createAdminSupabase(), viewer, signer: chooseApprovalSigner(process.env) }, body);
    return r.ok ? { status: 200, body: { state: r.state, linkedAt: r.linkedAt } } : { status: r.status, body: { message: r.message } };
  });
}
