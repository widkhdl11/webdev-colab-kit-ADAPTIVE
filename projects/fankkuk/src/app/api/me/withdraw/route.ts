import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { passwordAttemptsOf } from "@/entities/session/api/password-attempts";
import { readViewer } from "@/entities/session/model/viewer";
import { withdrawSelf } from "@/features/account-withdraw-self/model/withdraw-self";
import { signOut } from "@/features/auth/model/sign-out";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createDetachedAuth } from "@/shared/api/supabase/detached";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { sessionOnlyMarker } from "@/shared/api/supabase/session-cookies";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";
import { removeWithdrawnPhotos } from "@/features/account-withdraw-self/api/withdrawn-photos";

// 본인 탈퇴 (my-account INV-A17). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다. 본문은 지금 비밀번호 하나.
// 사람은 세션에서 확인한 사람뿐이다(INV-L2). DB 는 그 사람의 세션 클라이언트로 부른다 — 관리자 키는 비밀번호 확인용 계정 조회·횟수 기록과 사진 지우기에만.
// 끝나면 로그아웃처럼 이 기기의 로그인 쿠키와 「로그인 상태 유지」 표시를 지운다(session-login INV-L7·L15).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const admin = createAdminSupabase();
    const result = await withdrawSelf(
      {
        viewer: await readViewer(supabase),
        session: supabase,
        authAdmin: admin.auth.admin,
        makeDetachedAuth: createDetachedAuth,
        attempts: passwordAttemptsOf(admin),
        // 일회용 허가(2분, DB 시각) — 서버 키로만 남기고 거둘 수 있다. DB 의 본인 탈퇴는 이것이 없으면 처리하지 않는다
        grant: {
          give: async (userId) => {
            const { error } = await admin.rpc("self_withdrawal_grant", { p_profile_id: userId });
            if (error) throw new Error("본인 탈퇴 허가를 남기지 못했다");
          },
          drop: async (userId) => {
            const { error } = await admin.rpc("self_withdrawal_grant_drop", { p_profile_id: userId });
            if (error) throw new Error("본인 탈퇴 허가를 거두지 못했다");
          },
        },
        removePhotos: removeWithdrawnPhotos,
        endSession: async () => {
          // 계정이 이미 지워져 Auth 서버는 그 세션을 모른다고 답한다 — 라이브러리는 그 답을 넘기고 쿠키를 지운다
          await signOut(supabase.auth);
          const marker = sessionOnlyMarker(false, process.env);
          (await cookies()).set(marker.name, marker.value, marker.options);
        },
      },
      body,
    );
    if (result.ok) return { status: 200, body: { ok: true } };
    return { status: result.status, body: { field: result.field, message: result.message, links: result.links } };
  });
}
