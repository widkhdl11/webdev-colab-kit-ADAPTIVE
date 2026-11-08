import { readViewer } from "@/entities/session/model/viewer";
import { createBox } from "@/features/revgift-box-manage/model/box-manage";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 선물함 만들기 (revgift-box INV-GB3). 본문은 이름·받을 인원·공개 여부 셋뿐이다. 누구의 선물함인지는 DB 함수가 로그인 토큰으로 정한다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const r = await createBox({ client: supabase, viewer: await readViewer(supabase) }, body);
    return r.ok ? { status: 200, body: { boxId: r.boxId } } : { status: r.status, body: { message: r.message } };
  });
}
