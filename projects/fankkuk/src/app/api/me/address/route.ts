import { readViewer } from "@/entities/session/model/viewer";
import { saveFanAddress } from "@/features/fan-address/model/save-fan-address";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬 받을 주소 등록·변경 (address-protection INV-P1·P16·P17). 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다.
// 본문은 봉인된 주소와 고른 이름표뿐이다. 누구의 칸인지는 DB 저장 함수가 로그인 토큰으로 정한다 — 관리자 키를 쓰지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await saveFanAddress({ client: supabase, viewer: await readViewer(supabase) }, body);
    return result.ok ? { status: 200, body: {} } : { status: result.status, body: { message: result.message } };
  });
}
