import { readViewer } from "@/entities/session/model/viewer";
import { declineGift } from "@/features/approval-request/model/decline-gift";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 받지 않기(거절)와 차단. 같은 사이트의 JSON 요청만 받고, 모든 응답(처리 중 예외의 500 포함)에 no-store 를 붙인다.
// 거절하는 사람은 세션에서 확인한 사람이다(INV-L2). DB 도 로그인 토큰으로 그 주문의 크리에이터인지 다시 확인한다(INV-D1).
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await declineGift({ client: supabase, viewer: await readViewer(supabase) }, body);
    return result.ok
      ? { status: 200, body: { alsoDeclinedOrderNos: result.alsoDeclinedOrderNos } }
      : { status: result.status, body: { message: result.message } };
  });
}
