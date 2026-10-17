import { readViewer } from "@/entities/session/model/viewer";
import { confirmReturnAddress } from "@/features/return-address/model/confirm-return-address";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 반송 주소 확인(office-workflow INV-W15, action-center INV-J4) — 보낸 사람이 등록 주소 확인 창에서 「확인」을 누른다.
// 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다. 확인하는 사람은 세션에서 확인한 사람이다(INV-L2) —
// DB 도 로그인 토큰으로 그 상자 주문을 보낸 사람인지 다시 확인하고, 그 사람의 등록 주소 암호문을 상자에 복사한다. 주소는 오가지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await confirmReturnAddress({ client: supabase, viewer: await readViewer(supabase) }, body);
    if (result.ok) return { status: 200, body: { state: "confirmed" } };
    return "reason" in result ? { status: result.status, body: { reason: result.reason } } : { status: result.status, body: { message: result.message } };
  });
}
