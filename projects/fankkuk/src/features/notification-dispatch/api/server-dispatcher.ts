import { readMailConfig } from "@/shared/api/mail/config";
import { createSmtpSender } from "@/shared/api/mail/smtp";
import { readPhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
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
    // 카카오 줄을 만났을 때만 읽는다 — 키가 없으면 그 줄이 오류로 끝나고(다시 보낼 차례) 이메일 줄은 그대로 나간다
    phoneKeys: () => readPhoneKeys(process.env),
    chooseChannels: (hasKakaoTemplates) => chooseNotificationChannels(process.env, { sendMail, hasKakaoTemplates }),
  });
}
