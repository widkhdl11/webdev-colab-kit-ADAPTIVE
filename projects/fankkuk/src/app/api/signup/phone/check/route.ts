import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { VERIFICATION_COOKIE, withVerificationFromCookie } from "@/features/signup/lib/verification-cookie";
import { checkPhoneCode } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier, readPhoneCodeSecret } from "@/shared/api/phone-verifier/verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 가입 3단계 — 받은 인증번호 확인. 비교·만료·틀린 횟수는 서버와 DB 가 본다(INV-U1·U10·U15). 번호표는 쿠키에서만 읽는다(S1c).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const ticket = (await cookies()).get(VERIFICATION_COOKIE)?.value;
    const result = await checkPhoneCode(
      { admin: createAdminSupabase(), verifier: choosePhoneVerifier(process.env), codeSecret: () => readPhoneCodeSecret(process.env) },
      withVerificationFromCookie(body, ticket),
    );
    if (result.ok) return { status: 200, body: { status: "verified" } };
    return { status: result.status, body: { reason: result.reason, remaining: result.remaining, message: result.message } };
  }, REFINED_PRIVATE_JSON_COPY);
}
