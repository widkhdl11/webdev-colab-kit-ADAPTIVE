import { readViewer } from "@/entities/session/model/viewer";
import { startCreatorAddressSign } from "@/features/creator-address/model/save-creator-address";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터 주소 저장 서명 요청 (address-protection INV-P22 ①·③·④, INV-P1·P13). 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다.
// 본문은 봉인된 주소·이름표·할증 구분(그리고 「다시 보내기」 표시)뿐이다. 이 요청으로는 주소를 저장하지 않는다 — 카카오톡 서명이 검증된 뒤
// 결과 확인(/api/creator/address/result)에서 DB 가 저장한다. 가입 3단계 서명 직후의 첫 등록만 DB 가 바로 저장하고 { state: "saved" } 로 답한다.
// 누구의 주소인지는 세션에서 확인한 사람으로 정하고(INV-L2), DB 함수는 관리자 키로 부르되 넘기는 사람 ID 는 세션에서 확인한 것뿐이다(INV-L3).
// 응답에는 요청 ID·기한·상태만 — 주소·봉투·원문은 싣지 않는다. 서명 창구는 운영에서 없다 — 카카오 연결 전에는 운영에서 주소를 바꾸지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    const r = await startCreatorAddressSign({ admin: createAdminSupabase(), viewer, signer: chooseApprovalSigner(process.env) }, body);
    if (!r.ok) return { status: r.status, body: r.code ? { message: r.message, code: r.code } : { message: r.message } };
    return r.state === "saved"
      ? { status: 200, body: { state: "saved" } }
      : { status: 200, body: { state: "waiting", requestId: r.requestId, expiresAt: r.expiresAt } };
  });
}
