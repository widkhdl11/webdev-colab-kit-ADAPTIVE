import { NextResponse, type NextRequest } from "next/server";
import { signIn } from "@/features/auth/model/sign-in";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { isSameOriginJson } from "@/shared/lib/http/same-origin";

// 아이디 로그인. 성공하면 Supabase 클라이언트가 세션 쿠키(HttpOnly)를 응답에 쓴다(INV-L1).
// 실패 응답은 하나다(INV-L5). 응답 본문에 토큰을 싣지 않는다.
// 같은 사이트의 JSON 요청만 받는다 — 다른 사이트가 피해자를 공격자 계정으로 로그인시키지 못하게.
export async function POST(req: NextRequest) {
  if (!isSameOriginJson(req.headers)) {
    return NextResponse.json({ message: "잘못된 요청이에요." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
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
