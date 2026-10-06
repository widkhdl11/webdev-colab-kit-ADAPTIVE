import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { PHONE_CHANGE_COOKIE } from "@/features/phone-change/lib/verification-cookie";
import { PHONE_CHANGE_CLOSED } from "@/features/phone-change/model/change-phone";
import { checkPhoneVerification } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 번호 바꾸기 — 카카오톡에서 인증을 눌렀는지 서버가 직접 묻는다(INV-U1). 번호표는 쿠키에서만 읽는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async () => {
    const viewer = await readViewer(await createRequestSupabase());
    if (!viewer) return { status: 401, body: { message: "로그인이 필요해요." } };
    const verifier = choosePhoneVerifier(process.env);
    if (!verifier) return { status: 503, body: { message: PHONE_CHANGE_CLOSED } };
    const ticket = (await cookies()).get(PHONE_CHANGE_COOKIE)?.value;
    const result = await checkPhoneVerification({ admin: createAdminSupabase(), verifier }, { verificationId: ticket });
    if (result.ok) return { status: 200, body: { status: result.status } };
    return { status: result.status, body: { message: result.message } };
  });
}
