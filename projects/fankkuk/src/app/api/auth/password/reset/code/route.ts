import { cookies } from "next/headers";
import { after, type NextRequest } from "next/server";
import {
  RESET_TICKET_COOKIE,
  RESET_TICKET_MAX_AGE,
  RESET_VERIFICATION_COOKIE,
  RESET_VERIFICATION_MAX_AGE,
  resetCookieOptions,
} from "@/features/password-reset/lib/reset-cookies";
import { requestResetCode } from "@/features/password-reset/model/phone-reset";
import { startPhoneVerification } from "@/features/signup/model/phone-verification";
import { readPhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { choosePhoneVerifier, readPhoneCodeSecret } from "@/shared/api/phone-verifier/verifier";
import { clientIp, hashIp, readIpHashSecret } from "@/shared/api/request-ip/ip-hash";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 비밀번호 찾기 — 휴대폰 인증번호 받기(session-login INV-L10). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 가입과 같은 인증번호 함수·같은 한도(signup INV-U10)를 쓰고, 그 번호로 가입한 팬·크리에이터가 있을 때만 실제로 보낸다(DB 함수가 판정).
// 응답은 번호 꼴 오류·창구 없음 말고 모두 같은 200·같은 문장이다. 번호표는 스크립트가 못 읽는 쿠키로만 준다 —
// 계정이 있든 없든 똑같이 쓴다. 한도에 걸린 요청은 쿠키를 건드리지 않는다(앞서 받은 인증번호를 그대로 쓸 수 있게).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const admin = createAdminSupabase();
    const deps = {
      admin,
      verifier: choosePhoneVerifier(process.env),
      codeSecret: () => readPhoneCodeSecret(process.env),
      phoneKeys: () => readPhoneKeys(process.env),
    };
    const ipHash = hashIp(readIpHashSecret(process.env), clientIp(req.headers));
    // 계정 확인·발송은 응답 뒤(after) — 가입된 번호만 발송을 기다리면 응답 시간으로 가입 여부가 드러난다
    const result = await requestResetCode({ admin, start: (b, options) => startPhoneVerification(deps, b, ipHash, { ...options, defer: after }) }, body);
    if (result.status !== 200) return { status: result.status, body: { reason: result.reason, message: result.message } };
    if (result.verificationId) {
      const store = await cookies();
      store.set(RESET_VERIFICATION_COOKIE, result.verificationId, resetCookieOptions(process.env, RESET_VERIFICATION_MAX_AGE));
      // 새 인증번호를 받으면 앞서 받은 재설정 표 쿠키는 버린다
      store.set(RESET_TICKET_COOKIE, "", { ...resetCookieOptions(process.env, RESET_TICKET_MAX_AGE), maxAge: 0 });
    }
    return { status: 200, body: { message: result.message } };
  }, REFINED_PRIVATE_JSON_COPY);
}
