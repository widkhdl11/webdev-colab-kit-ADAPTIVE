import { z } from "zod";
import { FAN_NAME_MAX } from "@/entities/creator/model/fan-name";
import { TAG_COUNT_MESSAGE, tagCountWithin, tagSelectionFields } from "@/entities/creator/model/creator-tags";
import { HEARD_FROM } from "@/entities/metrics/model/signup-source";
import { SIGNUP_LOGIN_ID_PATTERN } from "@/entities/session/model/login-id";
import { nicknameSchema } from "@/entities/session/model/nickname-rule";
import { PASSWORD_KINDS, PASSWORD_MAX, PASSWORD_MIN, PASSWORD_SAME_AS_ID, PASSWORD_TOO_LONG, PASSWORD_TOO_SHORT, PASSWORD_WEAK, passwordKinds } from "@/entities/session/model/password-rule";
import { EMAIL_SHAPE } from "@/shared/lib/validation/email-shape";
import { charCount } from "@/shared/lib/validation/char-count";
import { HIDDEN_CHAR, LINE_BREAK } from "@/shared/lib/validation/hidden-char";
import { MOBILE_PHONE_SHAPE } from "@/shared/lib/validation/phone-shape";
import { EMAIL_CUSTOM, joinEmail, type EmailParts } from "./signup-fields";

// 가입 입력 경계(INV-U5·U6·U13). 앱 서버가 먼저 검사하고, DB 함수 create_account 가 같은 규칙으로 다시 검사한다.
// 본문에서 이 칸들만 꺼낸다 — 「인증 완료」 표시·사용자 ID·약관 판 번호는 와도 읽지 않는다(INV-U1).
// 닉네임은 가입 때 받는다(INV-U13) — 앞뒤 공백 뺀 1~12자. 금칙어·연락처 필터와 겹침은 DB 가 다시 본다.
// 휴대폰은 하이픈·공백을 빼고 숫자만 남긴 뒤 검사한다.
// 화면의 2단계 미리 보기(checkDetails)도 같은 detailsSchema 를 쓴다 — 규칙과 문구가 한 곳에만 있다.

/** 약관 판 번호는 서버가 정한다. 약관을 고치면 여기 날짜를 바꾼다. */
export const TERMS_VERSIONS = { service: "2026-10-01", privacy: "2026-10-01", news: "2026-10-01" } as const;

export type TermKey = keyof typeof TERMS_VERSIONS;

export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => MOBILE_PHONE_SHAPE.test(s), "휴대폰 번호를 확인해 주세요.");

export const verificationIdSchema = z.string().uuid("본인 확인을 다시 시도해 주세요.");

const detailsObject = z.object({
  loginId: z
    .string()
    .trim()
    .refine((s) => SIGNUP_LOGIN_ID_PATTERN.test(s), "아이디는 영문 소문자·숫자·밑줄(_) 4~20자로 입력해 주세요."),
  nickname: nicknameSchema,
  email: z
    .string()
    .trim()
    .refine((s) => s.length <= 254 && EMAIL_SHAPE.test(s), "이메일 주소를 확인해 주세요."),
  password: z
    .string()
    .min(PASSWORD_MIN, PASSWORD_TOO_SHORT)
    .max(PASSWORD_MAX, PASSWORD_TOO_LONG)
    .refine((v) => passwordKinds(v) >= PASSWORD_KINDS, PASSWORD_WEAK),
  phone: phoneSchema,
  terms: z.object({
    service: z.literal(true, { message: "필수 약관에 동의해 주세요." }),
    privacy: z.literal(true, { message: "필수 약관에 동의해 주세요." }),
    news: z.boolean().optional(),
  }),
});

/**
 * 크리에이터 기본 공개 정보 — 가입 때 받는다(creator-verification INV-V1, 「정한 것」 2026-10-05).
 * 이름 1~20자 · 채널 이름 1~40자(앞뒤 공백 뗀 글자 수) · 태그 1~5개(creator-tags INV-T3 — 선택지 id + 직접 입력 0~1개).
 * DB 함수 create_creator_account 가 같은 기준으로 다시 검사한다(선택지가 있는지·숨겼는지도 DB 가 본다).
 */
export const CREATOR_PROFILE_LIMITS = { name: 20, channelTitle: 40 } as const;

const trimmedWithin = (max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((s) => charCount(s) >= 1 && charCount(s) <= max, message);

const creatorProfileObject = z.object({
  name: trimmedWithin(CREATOR_PROFILE_LIMITS.name, `공개 이름을 1~${CREATOR_PROFILE_LIMITS.name}자로 입력해 주세요.`),
  channelTitle: trimmedWithin(CREATOR_PROFILE_LIMITS.channelTitle, `채널 이름을 1~${CREATOR_PROFILE_LIMITS.channelTitle}자로 입력해 주세요.`),
  ...tagSelectionFields,
  // 팬덤 이름(PRODUCT 「추가 요청 3」) — 선택, 0~10자. 내 팬꾹 꾸미기의 「팬을 부르는 이름」과 같은 칸(creators.fan_name)·같은 규칙.
  // 금칙어·연락처 필터는 DB 함수 create_creator_account 가 본다(P0084~P0086).
  fanName: z
    .string()
    .trim()
    .refine((s) => charCount(s) <= FAN_NAME_MAX, `팬덤 이름은 ${FAN_NAME_MAX}자까지 입력할 수 있습니다.`)
    .refine((s) => !HIDDEN_CHAR.test(s) && !LINE_BREAK.test(s), "팬덤 이름에 줄바꿈이나 보이지 않는 문자는 입력할 수 없습니다.")
    .optional(),
});

export const creatorProfileSchema = creatorProfileObject
  .refine(tagCountWithin, { message: TAG_COUNT_MESSAGE, path: ["tagIds"] });

export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>;

/** 화면이 보내는 크리에이터 공개 정보 — 태그는 고른 선택지 id 와 직접 입력(없으면 ""). */
export type CreatorProfileBody = { name: string; channelTitle: string; tagIds: readonly string[]; customTag: string; fanName?: string };

const CREATOR_REQUIRED = { message: "크리에이터 정보를 입력해 주세요.", path: ["creator", "name"] };
const creatorWhenCreator = (v: { role?: string; creator?: unknown }) => v.role !== "creator" || v.creator !== undefined;

const passwordNotLoginId = <T extends { loginId: string; password: string }>(v: T) => v.password !== v.loginId;
const PASSWORD_IS_ID = { message: PASSWORD_SAME_AS_ID, path: ["password"] };

export const signupInputSchema = detailsObject
  .extend({
    role: z.enum(["fan", "creator"], { message: "회원 유형을 선택해 주세요." }),
    verificationId: verificationIdSchema,
    // 팬이면 와도 쓰지 않는다(sign-up 이 크리에이터일 때만 넘긴다)
    creator: creatorProfileSchema.optional(),
    // metrics INV-Q4: 「어디서 알게 되셨나요」 — 고르는 것 하나, 답하지 않아도 된다(빈 값 = 고르지 않음). DB 가 같은 목록으로 다시 검사한다
    heardFrom: z.enum(HEARD_FROM, { message: "팬꾹을 알게 된 경로를 목록에서 선택해 주세요." }).nullable().optional(),
  })
  .refine(passwordNotLoginId, PASSWORD_IS_ID)
  .refine(creatorWhenCreator, CREATOR_REQUIRED);

export type SignupInput = z.infer<typeof signupInputSchema>;

/** 입력 오류가 가리키는 칸. 서버 응답과 화면이 같은 이름을 쓴다. */
export type DetailsField =
  | "loginId"
  | "nickname"
  | "email"
  | "password"
  | "passwordConfirm"
  | "phone"
  | "terms"
  | "creatorName"
  | "channelTitle"
  | "tags"
  | "fanName";

const DETAILS_FIELDS: readonly string[] = ["loginId", "nickname", "email", "password", "phone", "terms"];
const CREATOR_FIELDS: Record<string, DetailsField> = { name: "creatorName", channelTitle: "channelTitle", tagIds: "tags", customTag: "tags", fanName: "fanName" };

/** zod 오류의 첫 칸 이름. 2단계 칸이 아니면 null. */
export function detailsFieldOf(path: readonly PropertyKey[]): DetailsField | null {
  const head = path[0];
  if (head === "creator") {
    const sub = path[1];
    return typeof sub === "string" ? (CREATOR_FIELDS[sub] ?? "creatorName") : "creatorName";
  }
  return typeof head === "string" && DETAILS_FIELDS.includes(head) ? (head as DetailsField) : null;
}

/**
 * 2단계 칸을 화면에서 미리 본다 — 서버 검사와 같은 스키마. 틀린 첫 칸과 문구를 돌려준다.
 * 비밀번호 확인 칸만 화면에만 있다. 화면 편의일 뿐 판정은 서버가 다시 한다.
 */
export function checkDetails(v: {
  loginId: string;
  nickname: string;
  email: string;
  password: string;
  passwordConfirm: string;
  phone: string;
  terms: { service: boolean; privacy: boolean };
  /** 크리에이터로 가입할 때만 — 공개 이름·채널 이름(INV-V1)·태그(creator-tags INV-T3) */
  creator?: CreatorProfileBody;
}): { field: DetailsField; message: string } | null {
  const parsed = detailsObject
    .extend({ creator: creatorProfileSchema.optional() })
    .refine(passwordNotLoginId, PASSWORD_IS_ID)
    .safeParse(v);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { field: detailsFieldOf(issue?.path ?? []) ?? "loginId", message: issue?.message ?? "입력한 정보를 확인해 주세요." };
  }
  if (v.password !== v.passwordConfirm) return { field: "passwordConfirm", message: "비밀번호가 일치하지 않습니다." };
  return null;
}

/** 입력하는 동안 칸 바로 아래에 안내를 띄우는 칸 */
export type LiveField = "loginId" | "nickname" | "email" | "password" | "passwordConfirm" | "phone" | "creatorName" | "channelTitle";

/** 칸별 안내에 쓰는 값 — 이메일은 칸 셋(앞부분·고른 주소·직접 입력) 그대로 */
export type LiveValues = {
  loginId: string;
  nickname: string;
  email: EmailParts;
  password: string;
  passwordConfirm: string;
  phone: string;
  creatorName: string;
  channelTitle: string;
};

// 비밀번호 칸의 확인 문구 — 표 안에 글자로 바로 두면 비밀 값 검사가 비밀번호로 잘못 잡는다(2026-10-15)
const PW_FIELD_OK = "사용 가능한 비밀번호입니다.";

/** 맞을 때의 짧은 확인. 아이디·닉네임은 형식만 본 것이라 「쓸 수 있다」고 하지 않는다 — 겹침은 미리 확인(INV-U14)이 따로 알린다. */
const LIVE_OK: Record<LiveField, string> = {
  loginId: "올바른 형식입니다.",
  nickname: "올바른 형식입니다.",
  email: "올바른 형식입니다.",
  password: PW_FIELD_OK,
  passwordConfirm: "비밀번호가 일치합니다.",
  phone: "올바른 번호 형식입니다.",
  creatorName: "올바른 형식입니다.",
  channelTitle: "올바른 형식입니다.",
};

const firstMessage = (r: { success: boolean; error?: { issues: { message: string }[] } }): string | null =>
  r.success ? null : (r.error?.issues[0]?.message ?? "입력한 정보를 확인해 주세요.");

function emailPartsProblem(p: EmailParts): string | null {
  if (p.local.trim() === "") return "이메일의 @ 앞부분을 입력해 주세요.";
  if (p.choice === "") return "이메일 도메인(@ 뒤)을 선택해 주세요.";
  if (p.choice === EMAIL_CUSTOM && p.custom.trim() === "") return "이메일 도메인(@ 뒤)을 입력해 주세요.";
  return null;
}

/**
 * 칸 하나를 미리 본다(INV-U6) — 「다음」을 누를 때 checkDetails 가 쓰는 것과 같은 스키마를 칸마다 부른다.
 * 맞으면 짧은 확인, 틀리면 무엇이 틀렸는지. 화면 편의일 뿐 판정은 서버가 다시 한다.
 */
export function checkField(field: LiveField, v: LiveValues): { ok: boolean; message: string } {
  const shape = detailsObject.shape;
  const creatorShape = creatorProfileObject.shape;
  let problem: string | null;
  switch (field) {
    case "loginId":
      problem = firstMessage(shape.loginId.safeParse(v.loginId));
      break;
    case "nickname":
      problem = firstMessage(shape.nickname.safeParse(v.nickname));
      break;
    case "email":
      problem = emailPartsProblem(v.email) ?? firstMessage(shape.email.safeParse(joinEmail(v.email)));
      break;
    case "password":
      problem = firstMessage(shape.password.safeParse(v.password)) ?? (v.password === v.loginId.trim() ? PASSWORD_SAME_AS_ID : null);
      break;
    case "passwordConfirm":
      problem = v.passwordConfirm === "" ? "비밀번호를 한 번 더 입력해 주세요." : v.passwordConfirm !== v.password ? "비밀번호가 일치하지 않습니다." : null;
      break;
    case "phone":
      problem = firstMessage(phoneSchema.safeParse(v.phone));
      break;
    case "creatorName":
      problem = firstMessage(creatorShape.name.safeParse(v.creatorName));
      break;
    case "channelTitle":
      problem = firstMessage(creatorShape.channelTitle.safeParse(v.channelTitle));
      break;
  }
  return problem === null ? { ok: true, message: LIVE_OK[field] } : { ok: false, message: problem };
}

/** create_account 에 넘길 약관 동의 — 동의한 것만, 판 번호는 서버 값으로. */
export function consentRows(terms: SignupInput["terms"]): { key: TermKey; version: string }[] {
  const keys: TermKey[] = ["service", "privacy"];
  if (terms.news) keys.push("news");
  return keys.map((key) => ({ key, version: TERMS_VERSIONS[key] }));
}
