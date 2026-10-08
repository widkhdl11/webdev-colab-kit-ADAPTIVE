import type { NextRequest } from "next/server";
import { passwordAttemptsOf } from "@/entities/session/api/password-attempts";
import { resetPassword } from "@/features/password-reset/model/reset-password";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createDetachedAuth } from "@/shared/api/supabase/detached";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 재설정 링크로 새 비밀번호 정하기(session-login INV-L11). 링크를 여는 것(GET 화면)만으로는 아무것도 바뀌지 않고,
// 화면의 저장 버튼이 이 POST 를 보내야 바뀐다 — 메일 검사기가 링크를 미리 열어도 링크가 쓰이지 않게.
// 계정은 링크가 정한다. 끝나면 그 계정의 세션이 모두 끝나고, 이 요청도 로그인시키지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const admin = createAdminSupabase();
    const result = await resetPassword(
      { admin, authAdmin: admin.auth.admin, makeDetachedAuth: createDetachedAuth, attempts: passwordAttemptsOf(admin) },
      body,
    );
    // 바뀌었지만 세션을 끝내지 못했으면 다시 로그인하라는 문구가 실린다(message)
    if (result.ok) return { status: 200, body: result.message ? { ok: true, message: result.message } : { ok: true } };
    return { status: result.status, body: { field: result.field, message: result.message } };
  });
}
