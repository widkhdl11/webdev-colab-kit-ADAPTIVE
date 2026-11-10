import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { VERIFICATION_COOKIE, verificationCookieOptions } from "@/features/signup/lib/verification-cookie";
import { startCreatorSign } from "@/features/signup/model/creator-sign";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { readPhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { clientIp, hashIp, readIpHashSecret } from "@/shared/api/request-ip/ip-hash";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 크리에이터 가입 3단계 — 카카오 서명 요청(signup INV-U19). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(INV-U11).
// 본문은 봉인된 이름·생년월일·번호(identity)·크리에이터 ID·번호뿐이다. 가입 전이라 로그인 없이 부르고, DB 함수는 앱 서버 키로 부른다.
// 번호표는 응답 본문이 아니라 스크립트가 못 읽는 쿠키로만 준다(INV-U1, S1c) — 요청마다 새 번호표, 앞 번호표의 기다리는 요청은 DB 가 끝낸다.
// 창구 장애가 확인되면(INV-U20) state "down" — 화면은 6자리 길로 간다. 그때도 번호표 쿠키를 준다(인증번호 요청이 그 장애 기록을 옮긴다).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const jar = await cookies();
    const r = await startCreatorSign(
      { admin: createAdminSupabase(), signer: chooseApprovalSigner(process.env), phoneKeys: () => readPhoneKeys(process.env) },
      body,
      hashIp(readIpHashSecret(process.env), clientIp(req.headers)),
      jar.get(VERIFICATION_COOKIE)?.value ?? null,
    );
    if (!r.ok) return { status: r.status, body: { message: r.message } };
    jar.set(VERIFICATION_COOKIE, r.ticket, verificationCookieOptions(process.env));
    return r.state === "down"
      ? { status: 200, body: { state: "down" } }
      : { status: 200, body: { state: "pending", requestId: r.requestId, expiresAt: r.expiresAt } };
  }, REFINED_PRIVATE_JSON_COPY);
}
