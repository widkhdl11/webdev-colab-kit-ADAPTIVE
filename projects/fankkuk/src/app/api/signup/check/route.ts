import type { NextRequest } from "next/server";
import { checkSignupName } from "@/features/signup/model/check-name";
import { clientIp, hashIp, readIpHashSecret } from "@/shared/api/request-ip/ip-hash";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 아이디·닉네임 미리 확인(signup INV-U14). 로그인 없이 부른다 — 가입하는 사람은 아직 로그인 전이다.
// 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(가입 라우트와 같은 겉껍데기). 쿠키·세션은 읽지 않는다.
// 접속 주소는 여기서 비밀 값을 섞은 해시로 바꿔 DB 에 넘긴다 — 원문은 저장하지 않는다. 횟수 한도와 존재 여부는 DB 함수가 본다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const ipHash = hashIp(readIpHashSecret(process.env), clientIp(req.headers));
    return checkSignupName({ admin: createAdminSupabase() }, body, ipHash);
  }, REFINED_PRIVATE_JSON_COPY);
}
