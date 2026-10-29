import { NextResponse, type NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { setFollow } from "@/features/creator-follow/model/set-follow";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { isSameOriginJson } from "@/shared/lib/http/same-origin";

// 팔로우 켜기·끄기. 같은 사이트의 JSON 요청만 받는다 — 다른 사이트가 남의 팔로우를 바꾸지 못하게.
// 팔로우하는 사람은 세션에서 확인한 사람이다(INV-L2). DB 도 로그인 토큰으로 다시 확인한다.
export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!isSameOriginJson(req.headers)) {
    return NextResponse.json(
      { message: "유효하지 않은 요청입니다." },
      { status: 403, headers },
    );
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const supabase = await createRequestSupabase();
  const result = await setFollow(
    { client: supabase, viewer: await readViewer(supabase) },
    body,
  );
  if (result.ok)
    return NextResponse.json({ following: result.following }, { headers });
  return NextResponse.json(
    { message: result.message },
    { status: result.status, headers },
  );
}
