import { cookies } from "next/headers";
import { passwordAttemptsOf } from "@/entities/session/api/password-attempts";
import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { PHONE_CHANGE_COOKIE, phoneChangeCookieOptions } from "@/features/phone-change/lib/verification-cookie";
import { changePhone } from "@/features/phone-change/model/change-phone";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createDetachedAuth } from "@/shared/api/supabase/detached";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 휴대폰 번호 바꾸기(signup INV-U12). 사람은 세션에서 확인한 사람뿐이고, 본인 확인 번호표는 쿠키에서만 읽는다(본문의 번호표는 읽지 않는다).
// 바뀌면 번호표 쿠키를 지운다 — 같은 브라우저에서 다시 바꾸려면 본인 확인부터 다시 한다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const store = await cookies();
    const supabase = await createRequestSupabase();
    const admin = createAdminSupabase();
    const result = await changePhone(
      {
        admin,
        authAdmin: admin.auth.admin,
        makeDetachedAuth: createDetachedAuth,
        attempts: passwordAttemptsOf(admin),
        viewer: await readViewer(supabase),
        verifierReady: choosePhoneVerifier(process.env) !== null,
      },
      body,
      store.get(PHONE_CHANGE_COOKIE)?.value,
    );
    if (!result.ok) return { status: result.status, body: { field: result.field, message: result.message } };
    store.set(PHONE_CHANGE_COOKIE, "", { ...phoneChangeCookieOptions(process.env), maxAge: 0 });
    return { status: 200, body: { ok: true } };
  });
}
