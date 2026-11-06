import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { passwordAttemptsOf } from "@/entities/session/api/password-attempts";
import { RESET_TICKET_COOKIE, RESET_TICKET_MAX_AGE, resetCookieOptions } from "@/features/password-reset/lib/reset-cookies";
import { resetPassword } from "@/features/password-reset/model/reset-password";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createDetachedAuth } from "@/shared/api/supabase/detached";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 비밀번호 찾기 — 새 비밀번호 저장(session-login INV-L11). 재설정 표는 인증번호 확인 라우트가 준 쿠키에서만 읽는다(본문의 표는 읽지 않는다).
// 계정은 표가 정한다. 끝나면 그 계정의 세션이 모두 끝나고, 이 요청도 로그인시키지 않는다.
// 바뀌었거나 표가 죽었으면 표 쿠키를 지운다. 비밀번호를 잘못 적은 것뿐이면 남긴다(다시 적을 수 있게).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const store = await cookies();
    const admin = createAdminSupabase();
    const result = await resetPassword(
      { admin, authAdmin: admin.auth.admin, makeDetachedAuth: createDetachedAuth, attempts: passwordAttemptsOf(admin) },
      body,
      store.get(RESET_TICKET_COOKIE)?.value,
    );
    if (result.ok || result.field === "ticket") {
      store.set(RESET_TICKET_COOKIE, "", { ...resetCookieOptions(process.env, RESET_TICKET_MAX_AGE), maxAge: 0 });
    }
    // 바뀌었지만 세션을 끝내지 못했으면 다시 로그인하라는 문구가 실린다(message)
    if (result.ok) return { status: 200, body: result.message ? { ok: true, message: result.message } : { ok: true } };
    return { status: result.status, body: { field: result.field, message: result.message } };
  }, REFINED_PRIVATE_JSON_COPY);
}
