import { readViewer } from "@/entities/session/model/viewer";
import { saveCreatorAddress } from "@/features/creator-address/model/save-creator-address";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터 주소 등록·변경 (address-protection INV-P1·P13). 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다.
// 본문은 봉인된 주소 하나뿐이다. 누구의 주소인지는 세션에서 확인한 사람으로 정하고(INV-L2), 저장 함수는 관리자 키로 부르되
// 넘기는 사람 ID 는 세션에서 확인한 것뿐이다(INV-L3). 서명 창구는 운영에서 없다 — 카카오 연결 전에는 운영에서 주소를 바꾸지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    const result = await saveCreatorAddress({ admin: createAdminSupabase(), viewer, signer: chooseApprovalSigner(process.env) }, body);
    return result.ok ? { status: 200, body: {} } : { status: result.status, body: { message: result.message } };
  });
}
