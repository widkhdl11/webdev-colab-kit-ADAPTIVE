import { NextResponse, type NextRequest } from "next/server";
import { signOut } from "@/features/auth/model/sign-out";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { isSameOriginJson } from "@/shared/lib/http/same-origin";

// 로그아웃: 서버에서 세션을 끝내고 쿠키를 지운다(INV-L7). 로그인하지 않았어도 같은 응답.
// 같은 사이트의 JSON 요청만 받는다 — 다른 사이트가 강제로 로그아웃시키지 못하게.
export async function POST(req: NextRequest) {
  if (!isSameOriginJson(req.headers)) {
    return NextResponse.json({ message: "잘못된 요청이에요." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const supabase = await createRequestSupabase();
  await signOut(supabase.auth);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
