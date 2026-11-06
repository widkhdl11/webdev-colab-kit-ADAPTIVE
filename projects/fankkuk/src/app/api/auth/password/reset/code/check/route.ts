import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  RESET_TICKET_COOKIE,
  RESET_TICKET_MAX_AGE,
  RESET_VERIFICATION_COOKIE,
  RESET_VERIFICATION_MAX_AGE,
  resetCookieOptions,
} from "@/features/password-reset/lib/reset-cookies";
import { checkResetCode } from "@/features/password-reset/model/phone-reset";
import { checkPhoneCode } from "@/features/signup/model/phone-verification";
import { phoneHash, readPhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { choosePasswordResetVerifier, readPhoneCodeSecret } from "@/shared/api/phone-verifier/verifier";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 비밀번호 찾기 — 받은 인증번호 확인(session-login INV-L10·L11). 번호표는 쿠키에서만 읽는다.
// 맞으면 서버가 만든 재설정 표(10분·한 번)를 스크립트가 못 읽는 쿠키로만 주고, 다 쓴 번호표 쿠키는 지운다. 표는 응답 본문에 없다.
// 틀린 숫자의 응답은 가입 3단계와 같다(남은 횟수) — 계정이 없는 번호도 같은 길을 지난다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const store = await cookies();
    const admin = createAdminSupabase();
    const deps = {
      admin,
      // 시험 사이트에서는 창구가 없다 — 고정 인증번호로 남의 비밀번호를 바꿀 수 없게(test-site INV-TS2)
      verifier: choosePasswordResetVerifier(process.env),
      codeSecret: () => readPhoneCodeSecret(process.env),
      phoneKeys: () => readPhoneKeys(process.env),
    };
    const result = await checkResetCode(
      { admin, check: (b) => checkPhoneCode(deps, b), phoneHashOf: (phone) => phoneHash(readPhoneKeys(process.env), phone) },
      body,
      store.get(RESET_VERIFICATION_COOKIE)?.value,
    );
    if (!result.ok) return { status: result.status, body: { reason: result.reason, remaining: result.remaining, message: result.message } };
    store.set(RESET_TICKET_COOKIE, result.token, resetCookieOptions(process.env, RESET_TICKET_MAX_AGE));
    store.set(RESET_VERIFICATION_COOKIE, "", { ...resetCookieOptions(process.env, RESET_VERIFICATION_MAX_AGE), maxAge: 0 });
    return { status: 200, body: { status: "verified" } };
  }, REFINED_PRIVATE_JSON_COPY);
}
