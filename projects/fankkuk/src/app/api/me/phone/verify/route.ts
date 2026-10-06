import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { PHONE_CHANGE_COOKIE, phoneChangeCookieOptions } from "@/features/phone-change/lib/verification-cookie";
import { checkPhoneChangeStart, PHONE_CHANGE_CLOSED } from "@/features/phone-change/model/change-phone";
import { startPhoneVerification } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 번호 바꾸기 — 새 번호로 카카오톡 본인 확인 요청(signup INV-U12). 가입과 같은 함수·같은 한도(번호당 한 시간 다섯 번, INV-U10)를 쓴다.
// 로그인한 사람만 부르고, 지금 번호와 같은 번호면 카카오 요청 전에 거부한다. 번호표는 응답 본문이 아니라 스크립트가 못 읽는 쿠키(이 경로 아래에만 실려 감)로만 준다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const admin = createAdminSupabase();
    const verifier = choosePhoneVerifier(process.env);
    const viewer = await readViewer(await createRequestSupabase());
    const checked = await checkPhoneChangeStart({ admin, viewer, verifierReady: verifier !== null }, body);
    if (!checked.ok) return { status: checked.status, body: { field: checked.field, message: checked.message } };
    const result = await startPhoneVerification({ admin, verifier }, { phone: checked.phone });
    if (!result.ok) {
      const message = result.status === 503 ? PHONE_CHANGE_CLOSED : result.message;
      return { status: result.status, body: { field: "phone", message } };
    }
    (await cookies()).set(PHONE_CHANGE_COOKIE, result.verificationId, phoneChangeCookieOptions(process.env));
    return { status: 200, body: { requested: true } };
  });
}
