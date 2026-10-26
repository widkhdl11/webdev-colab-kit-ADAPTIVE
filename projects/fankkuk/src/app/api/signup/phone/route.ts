import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { VERIFICATION_COOKIE, verificationCookieOptions } from "@/features/signup/lib/verification-cookie";
import { startPhoneVerification } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 가입 3단계 — 카카오톡 본인 확인 요청. 번호표는 응답 본문이 아니라 스크립트가 못 읽는 쿠키로만 준다(INV-U1, S1c).
// 한도: 번호당 한 시간 다섯 번(INV-U10).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const result = await startPhoneVerification({ admin: createAdminSupabase(), verifier: choosePhoneVerifier(process.env) }, body);
    if (!result.ok) return { status: result.status, body: { message: result.message } };
    (await cookies()).set(VERIFICATION_COOKIE, result.verificationId, verificationCookieOptions(process.env));
    return { status: 200, body: { requested: true } };
  }, REFINED_PRIVATE_JSON_COPY);
}
