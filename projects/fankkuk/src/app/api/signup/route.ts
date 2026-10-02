import type { NextRequest } from "next/server";
import { signUp } from "@/features/signup/model/sign-up";
import { readMailConfig } from "@/shared/api/mail/config";
import { createSmtpSender } from "@/shared/api/mail/smtp";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 가입(signup 스펙). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(INV-U11).
// 계정 만들기는 앱 서버 키로 한다 — 가입하는 사람은 아직 로그인 전이다. 성공하면 요청한 브라우저의 세션으로 로그인한다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
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
      body,
    );
    if (result.ok) return { status: 200, body: { loggedIn: result.loggedIn, mailSent: result.mailSent } };
    return { status: result.status, body: { field: result.field, message: result.message } };
  });
}
