import type { NextRequest } from "next/server";
import { saveTagOptions } from "@/features/admin-creator-tags/model/save-tag-options";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 크리에이터 태그 선택지 관리(추가·이름 고치기·숨기기/보이기·순서)와 직접 입력을 선택지에 넣기 (creator-tags INV-T1·T5).
// 몸통의 kind 로 가른다. 운영자가 아니면(손님 포함) 404 — 판정은 saveTagOptions 가 DB 판정 함수로 한다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다. 관리자 키를 쓰면 DB 의 운영자 판정이 서버 계정 기준이 되어 아무나 바꾼다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => saveTagOptions(await createRequestSupabase(), body));
}
