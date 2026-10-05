import { z } from "zod";
import { accountLoginEmail } from "@/entities/session/model/login-id";
import type { SendMail } from "@/shared/api/mail/smtp";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { buildSignupMail } from "../lib/signup-mail";
import { consentRows, detailsFieldOf, signupInputSchema, type DetailsField } from "./signup-input";

// 가입 처리(signup 스펙). 순서:
// 1) 입력 검사(INV-U5·U6). 운영이면 카카오 연결 전이라 여기서 거부(INV-U9).
// 2) 번호표가 쓸 수 있는지, 확인된 번호가 입력 번호와 같은지 본다(INV-U1·U2). 아니면 로그인 정보를 만들지 않는다.
//    번호 중복은 이 확인을 통과한 뒤에만 알려 준다(INV-U11).
// 3) Supabase Auth 에 로그인 정보를 만든다 — 주소는 아이디로 만든 예약 도메인 주소(INV-U8). 이미 있으면 「쓰는 아이디」.
// 4) create_account(크리에이터면 create_creator_account — 확인 안 된 공개 정보 행까지) 가 프로필·연락처·확인 메일 기록·약관 동의를 한 번에 만들고 번호표를 「씀」으로 바꾼다(INV-U4).
//    실패하면 3)에서 만든 로그인 정보를 지운다 — 로그인은 되는데 프로필이 없는 계정이 남지 않게.
// 5) 그 사람으로 로그인해 세션 쿠키를 쓴다. 6) 확인 메일을 보낸다(INV-U7). 5·6 이 실패해도 계정은 그대로 둔다.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export type SignUpDeps = {
  env: Record<string, string | undefined>;
  admin: {
    rpc: Rpc;
    auth: {
      admin: {
        createUser(attrs: { email: string; password: string; email_confirm?: boolean }): PromiseLike<{
          data: { user: { id: string } | null };
          error: { code?: string } | null;
        }>;
        deleteUser(id: string): PromiseLike<{ error: unknown }>;
      };
    };
  };
  /** 요청한 브라우저의 세션 클라이언트 — 로그인에 성공하면 세션 쿠키를 응답에 쓴다. */
  auth: { signInWithPassword(c: { email: string; password: string }): PromiseLike<{ error: unknown }> };
  getMailer: () => { send: SendMail; appOrigin: string };
};

/** 오류가 가리키는 곳. 2단계 칸이면 화면이 그 칸으로 돌아간다. */
export type SignUpField = DetailsField | "verification" | "form";

export type SignUpResult =
  | { ok: true; loggedIn: boolean; mailSent: boolean }
  | { ok: false; status: 400 | 409 | 503; field: SignUpField; message: string };

const CLOSED = {
  ok: false,
  status: 503,
  field: "form",
  message: "지금은 가입을 받고 있지 않아요. 준비가 끝나면 알려 드릴게요.",
} as const;
const REVERIFY = { ok: false, status: 400, field: "verification", message: "본인 확인을 다시 해 주세요." } as const;
const ID_TAKEN = { ok: false, status: 409, field: "loginId", message: "이미 쓰는 아이디예요." } as const;
const PHONE_TAKEN = { ok: false, status: 409, field: "phone", message: "이미 가입된 휴대폰 번호예요. 로그인해 주세요." } as const;

const issuedSchema = z.array(z.object({ token: z.string(), email: z.string(), nickname: z.string() })).length(1);

export async function signUp(deps: SignUpDeps, body: unknown): Promise<SignUpResult> {
  if (!choosePhoneVerifier(deps.env)) return CLOSED;

  const parsed = signupInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path ?? [];
    const field: SignUpField = path[0] === "verificationId" ? "verification" : (detailsFieldOf(path) ?? "form");
    return { ok: false, status: 400, field, message: issue?.message ?? "입력을 확인해 주세요." };
  }
  const input = parsed.data;

  const usable = await deps.admin.rpc("usable_phone_verification", { p_id: input.verificationId });
  if (usable.error) throw new Error(`본인 확인 기록을 읽지 못했다: ${usable.error.code}`);
  if (typeof usable.data !== "string" || usable.data !== input.phone) return REVERIFY;

  const loginEmail = accountLoginEmail(input.loginId);
  if (!loginEmail) return { ok: false, status: 400, field: "loginId", message: "아이디를 확인해 주세요." };

  const attrs = { email: loginEmail, password: input.password, email_confirm: true };
  let created = await deps.admin.auth.admin.createUser(attrs);
  // 같은 아이디가 동시에 만들어지는 중이면 늦은 쪽은 코드 없는 오류(500)를 받는다. 한 번만 다시 시도하면
  // 먼저 온 쪽이 끝나 있어 email_exists 가 온다(INV-U3).
  if (created.error && !created.error.code) {
    created = await deps.admin.auth.admin.createUser(attrs);
  }
  if (created.error || !created.data.user) {
    if (created.error?.code === "email_exists") return ID_TAKEN;
    throw new Error(`로그인 정보를 만들지 못했다: ${created.error?.code ?? "사용자 없음"}`);
  }
  const userId = created.data.user.id;

  let account: Awaited<ReturnType<Rpc>>;
  try {
    const common = {
      p_user_id: userId,
      p_login_id: input.loginId,
      p_email: input.email,
      p_phone: input.phone,
      p_verification_id: input.verificationId,
      p_terms: consentRows(input.terms),
    };
    // creator-verification INV-V1·signup INV-U5: 크리에이터는 계정과 확인 안 된 공개 정보 행을 한 처리에서 만든다
    account =
      input.role === "creator" && input.creator
        ? await deps.admin.rpc("create_creator_account", {
            ...common,
            p_name: input.creator.name,
            p_channel_title: input.creator.channelTitle,
            p_category: input.creator.category,
          })
        : await deps.admin.rpc("create_account", { ...common, p_role: input.role });
  } catch (e) {
    await removeAuthUser(deps, userId);
    throw e;
  }
  if (account.error) {
    await removeAuthUser(deps, userId);
    if (account.error.code === "FKU01") return REVERIFY;
    if (account.error.code === "FKU02") return PHONE_TAKEN;
    if (account.error.code === "FKU03") return ID_TAKEN;
    if (account.error.code === "22023") return { ok: false, status: 400, field: "form", message: "입력을 확인해 주세요." };
    throw new Error(`계정을 만들지 못했다: ${account.error.code}`);
  }

  let loggedIn = false;
  try {
    const signedIn = await deps.auth.signInWithPassword({ email: loginEmail, password: input.password });
    loggedIn = !signedIn.error;
  } catch {
    loggedIn = false;
  }

  return { ok: true, loggedIn, mailSent: await sendSignupMail(deps, userId) };
}

/** INV-U4: 계정 만들기가 실패하면 방금 만든 로그인 정보를 지운다. 한 번 더 시도하고, 그래도 안 되면 오류로 올린다. */
async function removeAuthUser(deps: SignUpDeps, userId: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { error } = await deps.admin.auth.admin.deleteUser(userId);
      if (!error) return;
    } catch {
      // 다시 시도
    }
  }
  throw new Error(`계정 만들기 실패 뒤 로그인 정보를 지우지 못했다: ${userId}`);
}

async function sendSignupMail(deps: SignUpDeps, userId: string): Promise<boolean> {
  try {
    const issued = await deps.admin.rpc("issue_email_verification", { p_account_id: userId });
    if (issued.error) return false;
    const row = issuedSchema.parse(issued.data)[0]!;
    const mailer = deps.getMailer();
    await mailer.send(buildSignupMail({ to: row.email, nickname: row.nickname, token: row.token, appOrigin: mailer.appOrigin }));
    return true;
  } catch {
    return false;
  }
}
