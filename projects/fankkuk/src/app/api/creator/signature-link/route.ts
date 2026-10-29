import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { startSignatureLink } from "@/features/signature-link/model/signature-link";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { clientIp, hashIp, readIpHashSecret } from "@/shared/api/request-ip/ip-hash";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 승인 서명 연결 요청 (approval-signature INV-S16). 같은 사이트의 JSON 요청만 받고, 모든 응답에 no-store 를 붙인다.
// 본문은 봉인된 연결 정보 하나뿐이다. 누구의 연결인지는 세션에서 확인한 사람으로 정하고(INV-L2), DB 함수는 관리자 키로 부르되
// 넘기는 사람 ID 는 세션에서 확인한 것뿐이다(INV-L3). 서명 창구는 운영에서 없다 — 드림시큐리티 연결 전에는 운영에서 연결을 받지 않는다(S16d).
// 한도: 크리에이터마다 한 시간 다섯 번·하루 다섯 번, 같은 접속 주소 하루 스무 번 — 접속 주소는 비밀 값을 섞은 해시로만 넘긴다(가입 인증번호와 같은 방식).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const viewer = await readViewer(await createRequestSupabase());
    const r = await startSignatureLink(
      { admin: createAdminSupabase(), viewer, signer: chooseApprovalSigner(process.env) },
      body,
      hashIp(readIpHashSecret(process.env), clientIp(req.headers)),
    );
    return r.ok ? { status: 200, body: { requestId: r.requestId, expiresAt: r.expiresAt } } : { status: r.status, body: { message: r.message } };
  });
}
