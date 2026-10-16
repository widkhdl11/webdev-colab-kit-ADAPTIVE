import { readViewer } from "@/entities/session/model/viewer";
import { chooseCreatorCheck } from "@/features/creator-check/model/choose-check";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 블루투스 상자 받기·거절 고르기와 취소(office-workflow INV-W13). 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다.
// 고르는 사람은 세션에서 확인한 사람이다(INV-L2). DB 도 로그인 토큰으로 그 주문의 크리에이터인지 다시 확인한다.
// 상자를 움직이는 처리(운영자 처리)는 이 경로에 없다 — 운영자 화면의 /api/admin/work/creator-checks 만 한다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await chooseCreatorCheck({ client: supabase, viewer: await readViewer(supabase) }, body);
    return result.ok ? { status: 200, body: { state: result.state } } : { status: result.status, body: { message: result.message } };
  });
}
