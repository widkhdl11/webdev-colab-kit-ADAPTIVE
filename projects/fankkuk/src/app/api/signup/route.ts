import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { VERIFICATION_COOKIE, verificationCookieOptions, withVerificationFromCookie } from "@/features/signup/lib/verification-cookie";
import { signUp } from "@/features/signup/model/sign-up";
import { readMailConfig } from "@/shared/api/mail/config";
import { createSmtpSender } from "@/shared/api/mail/smtp";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createDeferredRequestSupabase } from "@/shared/api/supabase/server";
import { sessionOnlyMarker } from "@/shared/api/supabase/session-cookies";
import { KEEP_SIGNED_IN_DEFAULT } from "@/entities/session/model/keep-signed-in";
import { decodeUtm, UTM_COOKIE, utmCookieOptions } from "@/shared/lib/attribution/utm";
import { isProduction } from "@/shared/lib/env/is-production";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 가입(signup 스펙). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(INV-U11).
// 번호표는 쿠키에서만 읽는다(S1c). 계정 만들기는 앱 서버 키로 한다 — 가입하는 사람은 아직 로그인 전이다.
// 성공하면 요청한 브라우저의 세션으로 로그인하고, 다 쓴 번호표 쿠키를 지운다.
// 처음 들어온 공유 링크의 utm 쿠키(metrics INV-Q4)도 여기서 읽어 계정에 붙이고, 가입에 성공하면 지운다(개인정보처리방침 「가입할 때 한 번 읽어 계정에 붙인 뒤 지우고」).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const jar = await cookies();
    // session-login INV-L15 (S13f): 자동 로그인 쿠키는 로그인 화면의 기본값과 같은 쪽으로 쓴다.
    // 쓰기 규칙은 결과를 안 뒤에 정한다 — 자동 로그인이 됐으면 기본값, 아니면(예외 포함) 요청에 남은 표시.
    const { supabase, storedSessionOnly, decide } = await createDeferredRequestSupabase();
    const sessionOnly = !KEEP_SIGNED_IN_DEFAULT;
    let loggedIn = false;
    try {
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
        // metrics INV-Q4: 처음 들어온 공유 링크의 utm 은 쿠키에서만 읽고 다시 거른다
        decodeUtm(jar.get(UTM_COOKIE)?.value),
      );
      if (!result.ok) return { status: result.status, body: { field: result.field, message: result.message } };
      jar.set(VERIFICATION_COOKIE, "", { ...verificationCookieOptions(process.env), maxAge: 0 });
      jar.set(UTM_COOKIE, "", { ...utmCookieOptions(isProduction(process.env)), maxAge: 0 });
      loggedIn = result.loggedIn;
      // INV-L15: 자동 로그인이 됐을 때만 표시 쿠키를 쓴다 — 다음 요청부터 갱신(proxy)이 이 표시를 본다
      if (loggedIn) {
        const marker = sessionOnlyMarker(sessionOnly, process.env);
        jar.set(marker.name, marker.value, marker.options);
      }
      return { status: 200, body: { loggedIn: result.loggedIn, mailSent: result.mailSent } };
    } finally {
      decide(loggedIn ? sessionOnly : storedSessionOnly);
    }
  });
}
