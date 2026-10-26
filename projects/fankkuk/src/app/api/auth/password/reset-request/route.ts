import { after, type NextRequest } from "next/server";
import { requestPasswordReset } from "@/features/password-reset/model/request-reset";
import { readMailConfig } from "@/shared/api/mail/config";
import { createSmtpSender } from "@/shared/api/mail/smtp";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { handlePrivateJsonPost, REFINED_PRIVATE_JSON_COPY } from "@/shared/lib/http/private-json";

// 비밀번호 재설정 메일 요청(session-login INV-L10). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 로그인 전에 쓰는 화면이라 사람을 세션으로 정하지 않는다 — 아이디+이메일 대조와 한도는 DB 함수가 한다(앱 서버 키 전용).
// 응답은 언제나 같은 상태 코드·같은 문구다(빈 칸만 따로). 메일은 응답을 보낸 뒤(after) 보낸다 — 응답 시간이 메일 보내기에 따라 달라지지 않게.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const result = await requestPasswordReset(
      {
        admin: createAdminSupabase(),
        getMailer: () => {
          const mail = readMailConfig(process.env);
          return { send: createSmtpSender(mail), appOrigin: mail.appOrigin };
        },
        defer: (task) => after(task),
      },
      body,
    );
    return { status: result.status, body: { message: result.message } };
  }, REFINED_PRIVATE_JSON_COPY);
}
