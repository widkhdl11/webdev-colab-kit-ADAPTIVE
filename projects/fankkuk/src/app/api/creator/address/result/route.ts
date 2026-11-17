import { readViewer } from "@/entities/session/model/viewer";
import { checkCreatorAddressSign } from "@/features/creator-address/model/save-creator-address";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터 주소 저장 서명 결과 확인 (address-protection INV-P22 ②). 본문은 요청 ID 하나 — 결과는 서버가 서명 창구에 직접 묻고,
// 서명된 원문이 저장 원문과 같을 때만 DB 가 한 처리에서 주소 칸을 쓴다. 브라우저는 여기를 몇 초마다 부른다. 응답은 상태 하나뿐이다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    const r = await checkCreatorAddressSign({ admin: createAdminSupabase(), viewer, signer: chooseApprovalSigner(process.env) }, body);
    return r.ok ? { status: 200, body: { state: r.state } } : { status: r.status, body: { message: r.message } };
  });
}
