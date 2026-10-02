import type { NextRequest } from "next/server";
import { checkPhoneVerification } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 가입 3단계 — 카카오톡에서 인증을 눌렀는지 서버가 카카오에게 직접 묻는다(INV-U1). 본문에서는 번호표만 읽는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const result = await checkPhoneVerification({ admin: createAdminSupabase(), verifier: choosePhoneVerifier(process.env) }, body);
    if (result.ok) return { status: 200, body: { status: result.status } };
    return { status: result.status, body: { message: result.message } };
  });
}
