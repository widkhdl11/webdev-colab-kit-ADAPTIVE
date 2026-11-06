import { NextResponse, type NextRequest } from "next/server";
import { passwordAttemptsOf } from "@/entities/session/api/password-attempts";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { adminSignIn } from "@/features/auth/model/admin-sign-in";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createDeferredRequestSupabase } from "@/shared/api/supabase/server";
import { sessionOnlyMarker } from "@/shared/api/supabase/session-cookies";
import { isSameOriginJson } from "@/shared/lib/http/same-origin";

// 운영자 로그인 (admin-console INV-K13). 일반 로그인 라우트와 같은 겉(같은 사이트 JSON 만·실패 응답 하나·토큰은 HttpOnly 쿠키로만, session-login INV-L1·L5)에
// 운영자 판정 하나를 더한다 — 방금 로그인한 세션으로 DB 판정 함수(is_operator)에 묻고, 아니면 그 세션을 끝낸다.
// 「로그인 상태 유지」는 없다: 쿠키는 늘 브라우저를 닫으면 지워지는 쿠키로 쓴다(INV-L15 의 끔과 같은 쓰기).
// 주소를 /api/admin 아래에 두지 않는다 — 그 아래는 판정 재료를 못 읽으면 로그인 안 함으로 보는 운영자 주소다(session-login INV-L16).
//
// 비밀번호는 맞았는데 결과가 실패인 경우(운영자 아님·판정 오류·횟수 기록 오류·예외) — 방금 만든 세션을 서버에서 끝내고,
// 미뤄 둔 쿠키 쓰기는 응답에 싣지 않고 버린다(decide 를 부르지 않는다). 그래서 응답 쿠키가 틀린 비밀번호일 때와 같고(INV-K13 — 이 화면에서 회원인지 알 수 없다),
// 이 브라우저에 원래 있던 다른 계정의 로그인 쿠키도 건드리지 않는다.
const SESSION_ONLY = true;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  if (!isSameOriginJson(req.headers)) {
    return NextResponse.json({ message: "유효하지 않은 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." }, { status: 403, headers: NO_STORE });
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const { supabase, storedSessionOnly, decide } = await createDeferredRequestSupabase();
  let ok = false;
  let passwordAccepted = false;
  let sessionEnded = false;
  try {
    const result = await adminSignIn(
      {
        attempts: passwordAttemptsOf(createAdminSupabase()),
        auth: {
          signInWithPassword: async (c) => {
            const r = await supabase.auth.signInWithPassword(c);
            if (!r.error) passwordAccepted = true;
            return r;
          },
          signOut: (o) => {
            sessionEnded = true;
            return supabase.auth.signOut(o);
          },
        },
        env: process.env,
        isOperator: async () => (await readAdminAccess(supabase)) !== "not_found",
      },
      body,
    );
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status, headers: NO_STORE });
    ok = true;
    const response = NextResponse.json({ ok: true, next: result.next }, { headers: NO_STORE });
    const marker = sessionOnlyMarker(SESSION_ONLY, process.env);
    response.cookies.set(marker.name, marker.value, marker.options);
    return response;
  } finally {
    if (ok) {
      decide(SESSION_ONLY);
    } else if (passwordAccepted) {
      // 판정이 세션을 끝내기 전에 실패했으면(횟수 기록 오류 등) 여기서 끝낸다. decide 는 부르지 않는다 — 방금 로그인한 쿠키가 응답에 실리지 않는다(S13b)
      if (!sessionEnded) await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    } else {
      decide(storedSessionOnly); // 비밀번호부터 틀림 — 일반 로그인과 같다
    }
  }
}
