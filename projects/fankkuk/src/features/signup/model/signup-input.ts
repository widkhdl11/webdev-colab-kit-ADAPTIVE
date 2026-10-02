import { z } from "zod";
import { SIGNUP_LOGIN_ID_PATTERN } from "@/entities/session/model/login-id";
import { EMAIL_SHAPE } from "@/shared/lib/validation/email-shape";
import { MOBILE_PHONE_SHAPE } from "@/shared/lib/validation/phone-shape";

// 가입 입력 경계(INV-U5·U6). 앱 서버가 먼저 검사하고, DB 함수 create_account 가 같은 규칙으로 다시 검사한다.
// 본문에서 이 칸들만 꺼낸다 — 「인증 완료」 표시·사용자 ID·닉네임·약관 판 번호는 와도 읽지 않는다(INV-U1).
// 휴대폰은 하이픈·공백을 빼고 숫자만 남긴 뒤 검사한다.
// 화면의 2단계 미리 보기(checkDetails)도 같은 detailsSchema 를 쓴다 — 규칙과 문구가 한 곳에만 있다.

/** 약관 판 번호는 서버가 정한다. 약관을 고치면 여기 날짜를 바꾼다. */
export const TERMS_VERSIONS = { service: "2026-10-01", privacy: "2026-10-01", news: "2026-10-01" } as const;

export type TermKey = keyof typeof TERMS_VERSIONS;

export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => MOBILE_PHONE_SHAPE.test(s), "휴대폰 번호를 확인해 주세요.");

export const verificationIdSchema = z.string().uuid("본인 확인을 다시 해 주세요.");

const detailsObject = z.object({
  loginId: z
    .string()
    .trim()
    .refine((s) => SIGNUP_LOGIN_ID_PATTERN.test(s), "아이디는 영문 소문자·숫자·밑줄(_) 4~20자로 적어 주세요."),
  email: z
    .string()
    .trim()
    .refine((s) => s.length <= 254 && EMAIL_SHAPE.test(s), "이메일 주소를 확인해 주세요."),
  password: z.string().min(10, "비밀번호는 10자 이상으로 적어 주세요.").max(72, "비밀번호는 72자까지 쓸 수 있어요."),
  phone: phoneSchema,
  terms: z.object({
    service: z.literal(true, { message: "필수 약관에 동의해 주세요." }),
    privacy: z.literal(true, { message: "필수 약관에 동의해 주세요." }),
    news: z.boolean().optional(),
  }),
});

const passwordNotLoginId = <T extends { loginId: string; password: string }>(v: T) => v.password !== v.loginId;
const PASSWORD_IS_ID = { message: "비밀번호를 아이디와 다르게 적어 주세요.", path: ["password"] };

export const signupInputSchema = detailsObject
  .extend({
    role: z.enum(["fan", "creator"], { message: "회원 유형을 골라 주세요." }),
    verificationId: verificationIdSchema,
  })
  .refine(passwordNotLoginId, PASSWORD_IS_ID);

export type SignupInput = z.infer<typeof signupInputSchema>;

/** 입력 오류가 가리키는 칸. 서버 응답과 화면이 같은 이름을 쓴다. */
export type DetailsField = "loginId" | "email" | "password" | "passwordConfirm" | "phone" | "terms";

const DETAILS_FIELDS: readonly string[] = ["loginId", "email", "password", "phone", "terms"];

/** zod 오류의 첫 칸 이름. 2단계 칸이 아니면 null. */
export function detailsFieldOf(path: readonly PropertyKey[]): DetailsField | null {
  const head = path[0];
  return typeof head === "string" && DETAILS_FIELDS.includes(head) ? (head as DetailsField) : null;
}

/**
 * 2단계 칸을 화면에서 미리 본다 — 서버 검사와 같은 스키마. 틀린 첫 칸과 문구를 돌려준다.
 * 비밀번호 확인 칸만 화면에만 있다. 화면 편의일 뿐 판정은 서버가 다시 한다.
 */
export function checkDetails(v: {
  loginId: string;
  email: string;
  password: string;
  passwordConfirm: string;
  phone: string;
  terms: { service: boolean; privacy: boolean };
}): { field: DetailsField; message: string } | null {
  const parsed = detailsObject.refine(passwordNotLoginId, PASSWORD_IS_ID).safeParse(v);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { field: detailsFieldOf(issue?.path ?? []) ?? "loginId", message: issue?.message ?? "입력을 확인해 주세요." };
  }
  if (v.password !== v.passwordConfirm) return { field: "passwordConfirm", message: "비밀번호가 서로 달라요." };
  return null;
}

/** create_account 에 넘길 약관 동의 — 동의한 것만, 판 번호는 서버 값으로. */
export function consentRows(terms: SignupInput["terms"]): { key: TermKey; version: string }[] {
  const keys: TermKey[] = ["service", "privacy"];
  if (terms.news) keys.push("news");
  return keys.map((key) => ({ key, version: TERMS_VERSIONS[key] }));
}
