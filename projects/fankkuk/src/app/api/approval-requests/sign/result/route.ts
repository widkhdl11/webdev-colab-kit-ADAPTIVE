import { readViewer } from "@/entities/session/model/viewer";
import { checkApprovalSign } from "@/features/approval-request/model/approval-sign";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";
import { signReply } from "../sign-reply";

// 승인 서명 결과 확인 (approval-signature INV-S2·S12·S17). 본문은 승인 요청 ID 하나 — 결과는 서버가 서명 창구(게이트웨이)에 직접 묻고,
// 서명됐으면 그 자리에서 승인을 저장한다. 화면이 보낸 「서명했다」·서명 값은 읽지 않는다(S17d). 승인 창이 3초마다 부른다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    return signReply(await checkApprovalSign({ admin: createAdminSupabase(), viewer, signer: chooseApprovalSigner(process.env) }, body));
  });
}
