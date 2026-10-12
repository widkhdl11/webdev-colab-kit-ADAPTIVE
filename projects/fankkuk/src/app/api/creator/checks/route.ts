import { readViewer } from "@/entities/session/model/viewer";
import { answerCreatorCheck } from "@/features/creator-check/model/answer-check";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터 확인의 답(받기·돌려보내기 — 2026-10-12 (2) D3 ②). 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다.
// 답하는 사람은 세션에서 확인한 사람이다(INV-L2). DB 도 로그인 토큰으로 그 주문의 크리에이터인지 다시 확인한다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await answerCreatorCheck({ client: supabase, viewer: await readViewer(supabase) }, body);
    return result.ok ? { status: 200, body: { answer: result.answer } } : { status: result.status, body: { message: result.message } };
  });
}
