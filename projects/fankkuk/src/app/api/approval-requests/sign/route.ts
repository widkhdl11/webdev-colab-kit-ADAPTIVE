import { readViewer } from "@/entities/session/model/viewer";
import { startApprovalSign } from "@/features/approval-request/model/approval-sign";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";
import { signReply } from "./sign-reply";

// 승인 서명 요청 만들기 (approval-signature INV-S17). 크리에이터가 승인 창에서 「승인 요청 보내기」·「다시 요청」을 누를 때만 부른다 — 결제 때는 부르지 않는다.
// 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다. 본문은 승인 요청 ID 하나 — 기다리는 요청이 있으면 그것을 돌려준다.
// 승인하는 사람은 세션에서 확인한 사람이다(INV-L2). DB 함수는 관리자 키로 부르되 넘기는 사람 ID 는 세션에서 확인한 것뿐이다(INV-L3).
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    return signReply(await startApprovalSign({ admin: createAdminSupabase(), viewer, signer: chooseApprovalSigner(process.env) }, body));
  });
}
