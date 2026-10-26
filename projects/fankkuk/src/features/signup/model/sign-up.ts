import { z } from "zod";
import { tagFilterMessage } from "@/entities/creator/model/creator-tags";
import { accountLoginEmail, isReservedLoginId } from "@/entities/session/model/login-id";
import { nicknameRejection } from "@/entities/session/model/nickname-rule";
import type { SendMail } from "@/shared/api/mail/smtp";
import type { Utm } from "@/shared/lib/attribution/utm";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { buildSignupMail } from "../lib/signup-mail";
import { consentRows, detailsFieldOf, signupInputSchema, type DetailsField } from "./signup-input";

// 가입 처리(signup 스펙). 순서:
// 1) 입력 검사(INV-U5·U6). 운영이면 카카오 연결 전이라 여기서 거부(INV-U9).
// 2) 번호표가 쓸 수 있는지, 확인된 번호가 입력 번호와 같은지 본다(INV-U1·U2). 아니면 로그인 정보를 만들지 않는다.
//    번호 중복은 이 확인을 통과한 뒤에만 알려 준다(INV-U11).
// 3) Supabase Auth 에 로그인 정보를 만든다 — 주소는 아이디로 만든 예약 도메인 주소(INV-U8). 이미 있으면 「쓰는 아이디」.
// 4) create_account(크리에이터면 create_creator_account — 확인 안 된 공개 정보 행·팬덤 이름까지) 가 프로필·연락처·확인 메일 기록·약관 동의를 한 번에 만들고 번호표를 「씀」으로 바꾼다(INV-U4).
//    닉네임은 적은 값 그대로 넘긴다 — 겹침(영문 대소문자·앞뒤 공백 무시)과 금칙어·연락처 필터는 DB 가 판정한다(INV-U13, FKU04~07).
//    실패하면 3)에서 만든 로그인 정보를 지운다 — 로그인은 되는데 프로필이 없는 계정이 남지 않게.
// 5) 가입 경로(고른 답)와 처음 들어온 공유 링크의 utm(쿠키에서 거른 값)을 계정에 붙인다(metrics INV-Q4). 실패해도 가입은 그대로다.
// 6) 그 사람으로 로그인해 세션 쿠키를 쓴다. 7) 확인 메일을 보낸다(INV-U7). 5~7 이 실패해도 계정은 그대로 둔다.

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
  message: "현재 회원가입을 이용할 수 없습니다.",
} as const;
const REVERIFY = { ok: false, status: 400, field: "verification", message: "본인 확인을 다시 시도해 주세요." } as const;
const ID_TAKEN = { ok: false, status: 409, field: "loginId", message: "이미 사용 중인 아이디입니다." } as const;
const PHONE_TAKEN = { ok: false, status: 409, field: "phone", message: "이미 가입된 휴대폰 번호입니다. 로그인해 주세요." } as const;

const FAN_NAME_FILTER: Record<string, string> = {
  P0084: "팬덤 이름에 사용할 수 없는 표현이 포함되어 있습니다.",
  P0085: "팬덤 이름에 전화번호·이메일·인터넷 주소는 입력할 수 없습니다.",
  P0086: "팬덤 이름에 글자나 숫자를 하나 이상 넣어 주세요.",
};

const issuedSchema = z.array(z.object({ token: z.string(), email: z.string(), nickname: z.string() })).length(1);

/** utm: 처음 들어온 공유 링크의 utm — 라우트가 쿠키에서 읽어 다시 거른 값(없으면 null). 본문의 utm 칸은 읽지 않는다. */
export async function signUp(deps: SignUpDeps, body: unknown, utm: Utm | null = null): Promise<SignUpResult> {
  if (!choosePhoneVerifier(deps.env)) return CLOSED;

  const parsed = signupInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path ?? [];
    const field: SignUpField = path[0] === "verificationId" ? "verification" : (detailsFieldOf(path) ?? "form");
    return { ok: false, status: 400, field, message: issue?.message ?? "입력한 정보를 확인해 주세요." };
  }
  const input = parsed.data;

  const usable = await deps.admin.rpc("usable_phone_verification", { p_id: input.verificationId });
  if (usable.error) throw new Error(`본인 확인 기록을 읽지 못했다: ${usable.error.code}`);
  if (typeof usable.data !== "string" || usable.data !== input.phone) return REVERIFY;

  const loginEmail = accountLoginEmail(input.loginId);
  if (!loginEmail) return { ok: false, status: 400, field: "loginId", message: "아이디를 확인해 주세요." };
  // INV-U6: 탈퇴 처리가 쓰는 아이디는 이미 쓰는 아이디로 알린다 — 로그인 정보를 만들기 전에
  if (isReservedLoginId(input.loginId)) return ID_TAKEN;

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
      p_nickname: input.nickname,
    };
    // creator-verification INV-V1·signup INV-U5: 크리에이터는 계정과 확인 안 된 공개 정보 행을 한 처리에서 만든다
    account =
      input.role === "creator" && input.creator
        ? await deps.admin.rpc("create_creator_account", {
            ...common,
            p_name: input.creator.name,
            p_channel_title: input.creator.channelTitle,
            p_tag_ids: input.creator.tagIds,
            p_custom_tag: input.creator.customTag === "" ? null : input.creator.customTag,
            // 팬덤 이름(추가 요청 3) — 비우면 null
            p_fan_name: input.creator.fanName ? input.creator.fanName : null,
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
    // INV-U13: 이미 쓰는 닉네임(FKU04, 동시 가입에서 진 쪽 포함)·닉네임 필터(FKU05~07) — 닉네임 칸
    const nick = nicknameRejection(account.error.code);
    if (nick) return { ok: false, status: nick.status, field: "nickname", message: nick.message };
    // 팬덤 이름이 필터에 걸림(P0084~P0086) — 팬덤 이름 칸
    const fan = account.error.code ? FAN_NAME_FILTER[account.error.code] : undefined;
    if (fan && input.role === "creator") return { ok: false, status: 400, field: "fanName", message: fan };
    // 직접 입력이 태그 필터에 걸림(creator-tags INV-T7) — 사유마다 문구
    const filtered = tagFilterMessage(account.error.code);
    if (filtered && input.role === "creator") return { ok: false, status: 400, field: "tags", message: filtered };
    // 이름·채널 이름은 위에서 같은 규칙으로 걸렀다 — DB 가 거부하면 태그다(그 사이 숨긴 선택지 등, creator-tags INV-T3)
    if (account.error.code === "22023")
      return input.role === "creator"
        ? { ok: false, status: 400, field: "tags", message: "선택할 수 없는 태그가 포함되어 있습니다. 새로고침한 뒤 다시 선택해 주세요." }
        : { ok: false, status: 400, field: "form", message: "입력한 정보를 확인해 주세요." };
    throw new Error(`계정을 만들지 못했다: ${account.error.code}`);
  }

  await recordSignupSource(deps, userId, input.heardFrom ?? null, utm);

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

/** metrics INV-Q4: 가입 경로·utm 기록. 측정용이라 실패해도 가입을 되돌리지 않는다 — 서버 기록에만 남긴다. */
async function recordSignupSource(deps: SignUpDeps, userId: string, heardFrom: string | null, utm: Utm | null): Promise<void> {
  try {
    const { error } = await deps.admin.rpc("record_signup_source", {
      p_account_id: userId,
      p_heard_from: heardFrom,
      p_utm_source: utm?.source ?? null,
      p_utm_medium: utm?.medium ?? null,
      p_utm_campaign: utm?.campaign ?? null,
    });
    if (error) console.error(`가입 경로를 기록하지 못했다: ${error.code ?? "코드 없음"}`);
  } catch {
    console.error("가입 경로를 기록하지 못했다");
  }
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
