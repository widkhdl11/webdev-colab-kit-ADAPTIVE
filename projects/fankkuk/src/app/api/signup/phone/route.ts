import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { VERIFICATION_COOKIE, verificationCookieOptions } from "@/features/signup/lib/verification-cookie";
import { startPhoneVerification } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier, readPhoneCodeSecret } from "@/shared/api/phone-verifier/verifier";
import { clientIp, hashIp, readIpHashSecret } from "@/shared/api/request-ip/ip-hash";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 가입 3단계 — 카카오 알림톡(안 되면 문자)으로 6자리 인증번호 받기. 응답의 channel 은 실제로 간 길(kakao · sms, INV-U15). 번호표는 응답 본문이 아니라 스크립트가 못 읽는 쿠키로만 준다(INV-U1, S1c).
// 한도: 같은 번호 1분 한 번·하루 다섯 번, 같은 접속 주소 하루 스무 번(INV-U10) — 접속 주소는 비밀 값을 섞은 해시로만 넘긴다.
// 인증번호 원문은 응답에 없다(INV-U15).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const result = await startPhoneVerification(
      { admin: createAdminSupabase(), verifier: choosePhoneVerifier(process.env), codeSecret: () => readPhoneCodeSecret(process.env) },
      body,
      hashIp(readIpHashSecret(process.env), clientIp(req.headers)),
    );
    if (!result.ok) return { status: result.status, body: { reason: result.reason, message: result.message } };
    (await cookies()).set(VERIFICATION_COOKIE, result.verificationId, verificationCookieOptions(process.env));
    return { status: 200, body: { requested: true, channel: result.channel } };
  }, REFINED_PRIVATE_JSON_COPY);
}
