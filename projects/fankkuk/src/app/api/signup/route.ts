import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { VERIFICATION_COOKIE, verificationCookieOptions, withVerificationFromCookie } from "@/features/signup/lib/verification-cookie";
import { signUp } from "@/features/signup/model/sign-up";
import { readMailConfig } from "@/shared/api/mail/config";
import { createSmtpSender } from "@/shared/api/mail/smtp";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 가입(signup 스펙). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(INV-U11).
// 번호표는 쿠키에서만 읽는다(S1c). 계정 만들기는 앱 서버 키로 한다 — 가입하는 사람은 아직 로그인 전이다.
// 성공하면 요청한 브라우저의 세션으로 로그인하고, 다 쓴 번호표 쿠키를 지운다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const jar = await cookies();
    const supabase = await createRequestSupabase();
    const result = await signUp(
      {
        env: process.env,
        admin: createAdminSupabase(),
        auth: supabase.auth,
        getMailer: () => {
          const mail = readMailConfig(process.env);
          return { send: createSmtpSender(mail), appOrigin: mail.appOrigin };
        },
      },
      withVerificationFromCookie(body, jar.get(VERIFICATION_COOKIE)?.value),
    );
    if (!result.ok) return { status: result.status, body: { field: result.field, message: result.message } };
    jar.set(VERIFICATION_COOKIE, "", { ...verificationCookieOptions(process.env), maxAge: 0 });
    return { status: 200, body: { loggedIn: result.loggedIn, mailSent: result.mailSent } };
  });
}
