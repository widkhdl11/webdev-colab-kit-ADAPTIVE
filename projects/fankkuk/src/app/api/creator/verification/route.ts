import { readViewer } from "@/entities/session/model/viewer";
import { runVerificationAction } from "@/features/creator-verify/model/run-verification-action";
import { chooseChannelLoginVerifier } from "@/shared/api/platform-channel/login-verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터의 채널 확인 — 확인 요청·거두기·재확인 다시 요청·플랫폼 로그인 확인
// (creator-verification INV-V1·V2·V4·V14·V17·V20). 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다.
// 누구의 처리인지는 세션에서 확인한 사람(INV-L2). 관리자 키 함수(로그인 확인)에 넘기는 사람 ID 도 그것뿐이다(INV-L3).
// 로그인 창구는 운영에서 없다 — 외부 연결 전에는 운영에서 로그인 확인이 거부되고 운영자 확인(선물 링크 게시 확인)만 된다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const session = await createRequestSupabase();
    const viewer = await readViewer(session);
    return runVerificationAction(
      {
        session,
        admin: createAdminSupabase(),
        viewer,
        loginVerifier: chooseChannelLoginVerifier(process.env),
      },
      body,
    );
  });
}
