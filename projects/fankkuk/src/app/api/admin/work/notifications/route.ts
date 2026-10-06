import type { NextRequest } from "next/server";
import { dispatchNotifications } from "@/features/notification-dispatch/model/dispatch-notifications";
import { runDispatch } from "@/features/notification-dispatch/model/run-dispatch";
import { readMailConfig } from "@/shared/api/mail/config";
import { createSmtpSender } from "@/shared/api/mail/smtp";
import { chooseNotificationChannels } from "@/shared/api/notification-channel/channels";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 알림 지금 보내기 (notifications INV-N5·N11). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 운영자 판정은 로그인한 사람의 세션으로, 일꾼은 관리자 키로 — 일꾼 함수는 앱 서버 키만 실행할 수 있다.
// 메일 설정은 운영에서 빠진 값이 있으면 던진다(시작하지 않음). 링크 주소는 그 설정의 APP_ORIGIN 이다(INV-N9).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) =>
    runDispatch(await createRequestSupabase(), body, async () => {
      let mail;
      try {
        mail = readMailConfig(process.env);
      } catch {
        return { ok: false, reason: "config" };
      }
      const sendMail = createSmtpSender(mail);
      return dispatchNotifications({
        admin: createAdminSupabase(),
        appOrigin: mail.appOrigin,
        chooseChannels: (hasKakaoTemplates) => chooseNotificationChannels(process.env, { sendMail, hasKakaoTemplates }),
      });
    }),
  );
}
