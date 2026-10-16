import { readViewer } from "@/entities/session/model/viewer";
import { deleteFanAddress } from "@/features/fan-address/model/save-fan-address";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬 받을 주소 지우기 (address-protection INV-P17). 설정의 칸만 빈다 — 이미 받기를 한 역조공 몫의 복사본은 그 몫이 끝날 때까지 남는다.
// 누구의 칸인지는 DB 지우기 함수가 로그인 토큰으로 정한다. 본문은 읽지 않는다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async () => {
    const supabase = await createRequestSupabase();
    const result = await deleteFanAddress({ client: supabase, viewer: await readViewer(supabase) });
    return result.ok ? { status: 200, body: {} } : { status: result.status, body: { message: result.message } };
  });
}
