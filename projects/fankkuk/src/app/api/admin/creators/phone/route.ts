import type { NextRequest } from "next/server";
import { revealCreatorPhone } from "@/features/admin-phone-reveal/model/reveal-creator-phone";
import { readPhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 대표의 「전화번호 보기」(admin-console INV-K14). 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 대표 판정과 접속 기록은
// DB 가 그 토큰의 사람으로 한다. 관리자 키를 쓰지 않는다. 응답은 캐시되지 않는다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) =>
    revealCreatorPhone({ client: await createRequestSupabase(), phoneKeys: () => readPhoneKeys(process.env) }, body),
  );
}
