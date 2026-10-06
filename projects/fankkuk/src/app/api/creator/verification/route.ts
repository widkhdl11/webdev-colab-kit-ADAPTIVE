import { readViewer } from "@/entities/session/model/viewer";
import { runVerificationAction } from "@/features/creator-verify/model/run-verification-action";
import { chooseChannelBioReader } from "@/shared/api/platform-channel/bio-reader";
import { chooseChannelLoginVerifier } from "@/shared/api/platform-channel/login-verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터의 본인 확인 — 신청·다시 받기·운영자 확인 요청·거두기·코드 자동 확인·플랫폼 로그인 확인
// (creator-verification INV-V1·V2·V4·V5·V14·V16). 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다.
// 누구의 처리인지는 세션에서 확인한 사람(INV-L2). 관리자 키 함수(자동 확인·로그인 확인)에 넘기는 사람 ID 도 그것뿐이다(INV-L3).
// 로그인·소개란 창구는 운영에서 없다 — 외부 연결 전에는 운영에서 두 확인이 거부되고 운영자 확인만 된다.
export async function POST(req: Request) {
  return handlePrivateJsonPost(req, async (body) => {
    const session = await createRequestSupabase();
    const viewer = await readViewer(session);
    return runVerificationAction(
      {
        session,
        admin: createAdminSupabase(),
        viewer,
        bioReader: chooseChannelBioReader(process.env),
        loginVerifier: chooseChannelLoginVerifier(process.env),
      },
      body,
    );
  });
}
