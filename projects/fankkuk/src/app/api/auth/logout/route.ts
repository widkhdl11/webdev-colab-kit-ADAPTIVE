import { NextResponse } from "next/server";
import { signOut } from "@/features/auth/model/sign-out";
import { createRequestSupabase } from "@/shared/api/supabase/server";

// 로그아웃: 서버에서 세션을 끝내고 쿠키를 지운다(INV-L7). 로그인하지 않았어도 같은 응답.
export async function POST() {
  const supabase = await createRequestSupabase();
  await signOut(supabase.auth);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
