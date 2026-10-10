import type { NextRequest } from "next/server";
import { runReviewCancel } from "@/features/admin-review-cancel/model/run-review-cancel";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { createTossPaymentsClient, readTossSecretKey } from "@/shared/api/toss-payments/client";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 「확인 필요」 결제의 전액 취소 (payment INV-M20). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 잡기는 로그인한 사람의 세션 클라이언트로 — 대표인지는 DB 가 그 토큰의 사람으로 판정한다. 관리자 키는 결과 기록에만.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const env = process.env;
    return runReviewCancel(
      {
        session: await createRequestSupabase(),
        admin: createAdminSupabase(),
        toss: createTossPaymentsClient({ secretKey: readTossSecretKey(env), env, fetchImpl: fetch }),
      },
      body,
    );
  });
}
