import type { NextRequest } from "next/server";
import { passwordAttemptsOf } from "@/entities/session/api/password-attempts";
import { readViewer } from "@/entities/session/model/viewer";
import { changePassword } from "@/features/password-change/model/change-password";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createDetachedAuth } from "@/shared/api/supabase/detached";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 로그인한 사람의 비밀번호 바꾸기(session-login INV-L12). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 사람은 세션에서 확인한 사람뿐이다(INV-L2). 바꾸기는 그 사람의 세션으로 하고, 다른 기기의 세션은 끝낸다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await changePassword(
      {
        viewer: await readViewer(supabase),
        sessionAuth: supabase.auth,
        authAdmin: createAdminSupabase().auth.admin,
        makeDetachedAuth: createDetachedAuth,
        attempts: passwordAttemptsOf(createAdminSupabase()),
      },
      body,
    );
    // 바뀌었지만 세션을 끝내지 못했으면 다시 로그인하라는 문구가 실린다(message)
    if (result.ok) return { status: 200, body: result.message ? { ok: true, message: result.message } : { ok: true } };
    return { status: result.status, body: { field: result.field, message: result.message } };
  });
}
