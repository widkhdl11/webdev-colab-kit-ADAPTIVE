import type { NextRequest } from "next/server";
import { readViewer } from "@/entities/session/model/viewer";
import { saveAccount } from "@/features/account-edit/model/save-account";
import { readMailConfig } from "@/shared/api/mail/config";
import { createSmtpSender } from "@/shared/api/mail/smtp";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 내 정보 저장. 같은 사이트의 JSON 만, 응답은 캐시하지 않는다(my-account INV-A6).
// 사람은 세션에서 확인한 사람이고(INV-L2), DB 도 로그인 토큰으로 다시 확인한다(INV-A3).
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const supabase = await createRequestSupabase();
    const result = await saveAccount(
      {
        client: supabase,
        admin: createAdminSupabase(),
        viewer: await readViewer(supabase),
        getMailer: () => {
          const mail = readMailConfig(process.env);
          return { send: createSmtpSender(mail), appOrigin: mail.appOrigin };
        },
      },
      body,
    );
    if (result.ok) return { status: 200, body: { pendingEmail: result.pendingEmail } };
    return { status: result.status, body: { message: result.message } };
  });
}
