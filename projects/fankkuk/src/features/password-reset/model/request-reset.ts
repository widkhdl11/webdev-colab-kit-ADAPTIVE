import { z } from "zod";
import type { SendMail } from "@/shared/api/mail/smtp";
import { buildResetMail } from "../lib/reset-mail";

// 비밀번호 재설정 요청(session-login INV-L10). 아이디와 이메일 둘 다 받는다.
// 계정·확인된 이메일 대조, 한 시간 다섯 통 한도, 이전 링크 무효, 링크 해시 기록은 DB 함수 request_password_reset 이 한 번에 한다(앱 서버 키 전용).
// 응답은 언제나 하나다 — 계정이 없을 때·이메일이 다를 때·확인된 이메일이 없을 때·한도를 넘었을 때·메일을 보냈을 때·메일 보내기에 실패했을 때.
// (메일 보내기 실패를 따로 알리면 「그 아이디와 이메일이 맞다」가 새어 나간다.) 빈 칸만 따로 안내한다 — 입력한 사람이 이미 아는 사실이다.
// 메일 보내기는 응답을 보낸 뒤에 한다(defer — 라우트에서는 Next 의 after). 응답 전에 보내면 메일 서버와 주고받는 시간만큼
// 「맞는 아이디+이메일」의 응답이 늦어져, 응답 시간으로 가입 여부·이메일 일치를 알아낼 수 있다.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export type RequestResetDeps = {
  admin: { rpc: Rpc };
  getMailer: () => { send: SendMail; appOrigin: string };
  /** 응답을 보낸 뒤에 할 일을 맡긴다. 맡긴 일의 실패는 응답에 영향을 주지 않는다. */
  defer: (task: () => Promise<void>) => void;
};

export const RESET_REQUESTED_MESSAGE = "입력한 정보가 가입 정보와 일치하면 재설정 메일이 발송됩니다.";

export type RequestResetResult = { status: 200 | 400; message: string };

const inputSchema = z.object({
  loginId: z.string().max(100).transform((s) => s.trim()),
  email: z.string().max(254).transform((s) => s.trim()),
});

const issuedSchema = z.array(z.object({ token: z.string(), email: z.string(), nickname: z.string() })).max(1);

export async function requestPasswordReset(deps: RequestResetDeps, body: unknown): Promise<RequestResetResult> {
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success || parsed.data.loginId === "" || parsed.data.email === "") {
    return { status: 400, message: "아이디와 이메일을 입력해 주세요." };
  }

  const issued = await deps.admin.rpc("request_password_reset", { p_login_id: parsed.data.loginId, p_email: parsed.data.email });
  if (issued.error) throw new Error(`재설정 링크를 만들지 못했다: ${issued.error.code}`);
  const row = issuedSchema.parse(issued.data)[0];

  if (row) {
    deps.defer(async () => {
      try {
        const mailer = deps.getMailer();
        await mailer.send(buildResetMail({ to: row.email, nickname: row.nickname, token: row.token, appOrigin: mailer.appOrigin }));
      } catch (e) {
        // 응답은 이미 나갔다 — 메일이 안 오면 화면 안내대로 다시 요청하거나 1:1 문의를 남긴다
        console.error("password-reset: 재설정 메일을 보내지 못했다", e instanceof Error ? e.name : typeof e);
      }
    });
  }
  return { status: 200, message: RESET_REQUESTED_MESSAGE };
}
