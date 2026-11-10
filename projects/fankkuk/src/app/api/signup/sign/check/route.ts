import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { VERIFICATION_COOKIE } from "@/features/signup/lib/verification-cookie";
import { checkCreatorSign } from "@/features/signup/model/creator-sign";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { readPhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 크리에이터 가입 3단계 — 카카오 서명 결과 확인(signup INV-U19·U20). 본문은 요청 ID 하나, 번호표는 쿠키에서만 읽는다(S1c).
// 결과는 서버가 서명 창구에 직접 묻는다. 「확인됨」은 DB 가 서명된 원문을 저장 원문과 대조해 통과했을 때만 적는다(S19b).
// 브라우저는 여기를 몇 초마다 부르고, state 가 verified 면 가입 요청(/api/signup)을 보낸다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const ticket = (await cookies()).get(VERIFICATION_COOKIE)?.value ?? null;
    const r = await checkCreatorSign(
      { admin: createAdminSupabase(), signer: chooseApprovalSigner(process.env), phoneKeys: () => readPhoneKeys(process.env) },
      body,
      ticket,
    );
    return r.ok ? { status: 200, body: { state: r.state } } : { status: r.status, body: { message: r.message } };
  }, REFINED_PRIVATE_JSON_COPY);
}
