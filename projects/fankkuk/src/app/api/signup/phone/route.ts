import type { NextRequest } from "next/server";
import { startPhoneVerification } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 가입 3단계 — 카카오톡 본인 확인 요청. 화면에는 번호표만 돌려준다(INV-U1). 한도: 번호당 한 시간 다섯 번(INV-U10).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const result = await startPhoneVerification({ admin: createAdminSupabase(), verifier: choosePhoneVerifier(process.env) }, body);
    if (result.ok) return { status: 200, body: { verificationId: result.verificationId } };
    return { status: result.status, body: { message: result.message } };
  });
}
