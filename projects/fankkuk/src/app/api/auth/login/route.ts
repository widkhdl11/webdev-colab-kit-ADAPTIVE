import { NextResponse, type NextRequest } from "next/server";
import { signIn } from "@/features/auth/model/sign-in";
import { createRequestSupabase } from "@/shared/api/supabase/server";

// 아이디 로그인. 성공하면 Supabase 클라이언트가 세션 쿠키(HttpOnly)를 응답에 쓴다(INV-L1).
// 실패 응답은 하나다(INV-L5). 응답 본문에 토큰을 싣지 않는다.
export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const supabase = await createRequestSupabase();
  const result = await signIn({ auth: supabase.auth, env: process.env }, body);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
