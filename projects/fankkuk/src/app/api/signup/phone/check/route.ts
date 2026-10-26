import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { VERIFICATION_COOKIE, withVerificationFromCookie } from "@/features/signup/lib/verification-cookie";
import { checkPhoneVerification } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 가입 3단계 — 카카오톡에서 인증을 눌렀는지 서버가 카카오에게 직접 묻는다(INV-U1). 번호표는 쿠키에서만 읽는다(S1c).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const ticket = (await cookies()).get(VERIFICATION_COOKIE)?.value;
    const result = await checkPhoneVerification(
      { admin: createAdminSupabase(), verifier: choosePhoneVerifier(process.env) },
      withVerificationFromCookie(body, ticket),
    );
    if (result.ok) return { status: 200, body: { status: result.status } };
    return { status: result.status, body: { message: result.message } };
  }, REFINED_PRIVATE_JSON_COPY);
}
