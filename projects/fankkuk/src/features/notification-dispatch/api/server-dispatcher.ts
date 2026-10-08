import { readMailConfig } from "@/shared/api/mail/config";
import { createSmtpSender } from "@/shared/api/mail/smtp";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { dispatchNotifications, emptyCounts, type DispatchResult } from "../model/dispatch-notifications";
import { chooseNotificationChannels } from "./channels";

// 서버 설정으로 보내는 일꾼을 한 번 돌린다 — 운영자의 「알림 지금 보내기」(api/admin/work/notifications)와
// 5분마다의 예약 발송 입구(api/cron/notifications, INV-N16)가 같은 일꾼을 쓴다.
// 메일 설정은 운영에서 빠진 값이 있으면 던진다 — 그때는 줄을 꺼내지 않고 설정 오류로 끝낸다. 링크 주소는 그 설정의 APP_ORIGIN 이다(INV-N9).
export async function runServerDispatcher(): Promise<DispatchResult> {
  let mail;
  try {
    mail = readMailConfig(process.env);
  } catch {
    return { ok: false, reason: "config", counts: emptyCounts() };
  }
  const sendMail = createSmtpSender(mail);
  return dispatchNotifications({
    admin: createAdminSupabase(),
    appOrigin: mail.appOrigin,
    chooseChannels: (hasKakaoTemplates) => chooseNotificationChannels(process.env, { sendMail, hasKakaoTemplates }),
  });
}
