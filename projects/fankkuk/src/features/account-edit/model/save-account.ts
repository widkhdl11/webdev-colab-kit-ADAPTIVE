import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { nicknameRejection } from "@/entities/session/model/nickname-rule";
import type { Viewer } from "@/entities/session/model/viewer";
import type { SendMail } from "@/shared/api/mail/smtp";
import { buildVerificationMail } from "../lib/verification-mail";
import { accountInputSchema } from "./account-input";

// 내 정보 저장. 두 단계다.
// 1) 요청한 사람의 세션 클라이언트로 update_my_account — DB 가 로그인 토큰으로 사람을 정하고(INV-A3) 입력을 다시 검사한다(INV-A5).
//    이메일이 확인된 이메일과 다르면 확인 대기로만 저장하고 true 를 돌려준다(INV-A7).
// 2) true 면 앱 서버 키로 issue_email_verification — 링크 값은 로그인 사용자에게 돌려주지 않으려고 앱 서버 키 전용이다.
//    넘기는 계정 ID 는 세션에서 확인한 ID 뿐이다(INV-L3). 받은 링크 값은 메일에만 넣고 응답에는 넣지 않는다.
// 팬만 쓴다 — 크리에이터 설정은 따로다(my-account 비범위).
// 메일 설정은 메일이 필요할 때만 읽는다 — 설정이 빠져도 닉네임·알림 저장은 된다.
// 닉네임이 남과 겹치거나(FKU04) 필터에 걸리면(FKU05~07) 닉네임 칸 오류로 돌려준다(signup INV-U13).

export type SaveAccountDeps = {
  client: Pick<SupabaseClient, "rpc">;
  admin: Pick<SupabaseClient, "rpc">;
  viewer: Viewer | null;
  getMailer: () => { send: SendMail; appOrigin: string };
};

export type SaveAccountResult =
  | { ok: true; pendingEmail: string | null }
  | { ok: false; status: 400 | 401 | 403 | 409 | 429 | 502; message: string; field?: "nickname" };

const issuedSchema = z.array(z.object({ token: z.string(), email: z.string(), nickname: z.string() })).length(1);

const TOO_MANY = "확인 메일을 너무 자주 보냈어요. 한 시간 뒤에 다시 해 주세요.";

export async function saveAccount(deps: SaveAccountDeps, body: unknown): Promise<SaveAccountResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "fan") return { ok: false, status: 403, message: "팬 계정의 개인정보만 여기서 고칠 수 있어요." };

  const parsed = accountInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.message ?? "입력을 확인해 주세요.";
    return issue?.path[0] === "nickname" ? { ok: false, status: 400, field: "nickname", message } : { ok: false, status: 400, message };
  }
  const input = parsed.data;

  const updated = await deps.client.rpc("update_my_account", {
    p_nickname: input.nickname,
    p_email: input.email,
    p_notify_kakao: input.notifyKakao,
    p_notify_email: input.notifyEmail,
  });
  if (updated.error) {
    const nick = nicknameRejection(updated.error.code);
    if (nick) return { ok: false, status: nick.status, field: "nickname", message: nick.message };
    if (updated.error.code === "22023") return { ok: false, status: 400, message: "입력을 확인해 주세요." };
    if (updated.error.code === "FK429") return { ok: false, status: 429, message: TOO_MANY };
    if (updated.error.code === "42501") return { ok: false, status: 401, message: "로그인이 필요해요." };
    throw new Error(`내 정보를 저장하지 못했다: ${updated.error.code}`);
  }
  if (updated.data !== true) return { ok: true, pendingEmail: null };

  const issued = await deps.admin.rpc("issue_email_verification", { p_account_id: deps.viewer.userId });
  if (issued.error) {
    if (issued.error.code === "FK429") return { ok: false, status: 429, message: TOO_MANY };
    throw new Error(`확인 링크를 만들지 못했다: ${issued.error.code}`);
  }
  const rows = issuedSchema.safeParse(issued.data);
  if (!rows.success) throw new Error("확인 링크 응답의 꼴이 틀렸다");
  const row = rows.data[0]!;

  const mailer = deps.getMailer();
  try {
    await mailer.send(buildVerificationMail({ to: row.email, nickname: row.nickname, token: row.token, appOrigin: mailer.appOrigin }));
  } catch {
    return {
      ok: false,
      status: 502,
      message: "다른 정보는 저장했지만 확인 메일을 보내지 못했어요. 잠시 뒤 다시 저장해 주세요.",
    };
  }
  return { ok: true, pendingEmail: row.email };
}
