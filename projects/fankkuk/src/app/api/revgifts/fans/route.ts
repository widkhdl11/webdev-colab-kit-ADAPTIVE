import { NextResponse, type NextRequest } from "next/server";
import { FanLookupLimitError, findRevgiftFan } from "@/entities/revgift/api/revgift-reads";
import { LOGIN_ID_PATTERN } from "@/entities/session/model/login-id";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { createRequestSupabase } from "@/shared/api/supabase/server";

// 역조공 받을 팬 찾기(INV-R2). 아이디를 정확히 넣어야 하고, 못 찾는 경우(없는 아이디·팔로우 안 한 팬·크리에이터 아이디)는
// 모두 같은 응답이다. 찾는 사람을 팔로우하는지는 DB 가 로그인 토큰으로 판정한다.
// 크리에이터마다 10분에 30번까지 — 넘으면 429(아이디를 대량으로 넣어 보며 팔로워를 모으는 길을 좁힌다).
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const supabase = await createRequestSupabase();
  if (!(await readVerifiedUserId(supabase.auth))) return NextResponse.json({ message: "로그인이 필요해요." }, { status: 401, headers });
  const loginId = req.nextUrl.searchParams.get("loginId") ?? "";
  try {
    const fan = LOGIN_ID_PATTERN.test(loginId) ? await findRevgiftFan(supabase, loginId) : null;
    return NextResponse.json({ fan }, { headers });
  } catch (e) {
    if (e instanceof FanLookupLimitError) return NextResponse.json({ message: "잠시 뒤에 다시 찾아 주세요." }, { status: 429, headers });
    throw e;
  }
}
