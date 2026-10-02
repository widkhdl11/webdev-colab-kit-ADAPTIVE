import { z } from "zod";
import { SIGNUP_LOGIN_ID_PATTERN } from "@/entities/session/model/login-id";
import { EMAIL_SHAPE } from "@/shared/lib/validation/email-shape";

// 가입 입력 경계(INV-U5·U6). 앱 서버가 먼저 검사하고, DB 함수 create_account 가 같은 규칙으로 다시 검사한다.
// 본문에서 이 칸들만 꺼낸다 — 「인증 완료」 표시·사용자 ID·닉네임·약관 판 번호는 와도 읽지 않는다(INV-U1).
// 휴대폰은 하이픈·공백을 빼고 숫자만 남긴 뒤 검사한다.

export const PHONE_SHAPE = /^01[016789][0-9]{7,8}$/;

/** 약관 판 번호는 서버가 정한다. 약관을 고치면 여기 날짜를 바꾼다. */
export const TERMS_VERSIONS = { service: "2026-10-01", privacy: "2026-10-01", news: "2026-10-01" } as const;

export type TermKey = keyof typeof TERMS_VERSIONS;

export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => PHONE_SHAPE.test(s), "휴대폰 번호를 확인해 주세요.");

export const verificationIdSchema = z.string().uuid("본인 확인을 다시 해 주세요.");

export const signupInputSchema = z
  .object({
    role: z.enum(["fan", "creator"], { message: "회원 유형을 골라 주세요." }),
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
    verificationId: verificationIdSchema,
  })
  .refine((v) => v.password !== v.loginId, { message: "비밀번호를 아이디와 다르게 적어 주세요.", path: ["password"] });

export type SignupInput = z.infer<typeof signupInputSchema>;

export type DetailsField = "loginId" | "email" | "password" | "passwordConfirm" | "phone" | "terms";

/**
 * 2단계 칸을 화면에서 미리 본다 — 서버 검사와 같은 규칙. 틀린 첫 칸과 문구를 돌려준다.
 * 화면 편의일 뿐 판정은 서버가 다시 한다.
 */
export function checkDetails(v: {
  loginId: string;
  email: string;
  password: string;
  passwordConfirm: string;
  phone: string;
  terms: { service: boolean; privacy: boolean };
}): { field: DetailsField; message: string } | null {
  const id = v.loginId.trim();
  if (!SIGNUP_LOGIN_ID_PATTERN.test(id)) return { field: "loginId", message: "아이디는 영문 소문자·숫자·밑줄(_) 4~20자로 적어 주세요." };
  const email = v.email.trim();
  if (email.length > 254 || !EMAIL_SHAPE.test(email)) return { field: "email", message: "이메일 주소를 확인해 주세요." };
  if (v.password.length < 10) return { field: "password", message: "비밀번호는 10자 이상으로 적어 주세요." };
  if (v.password.length > 72) return { field: "password", message: "비밀번호는 72자까지 쓸 수 있어요." };
  if (v.password === id) return { field: "password", message: "비밀번호를 아이디와 다르게 적어 주세요." };
  if (v.password !== v.passwordConfirm) return { field: "passwordConfirm", message: "비밀번호가 서로 달라요." };
  if (!PHONE_SHAPE.test(v.phone.replace(/[\s-]/g, ""))) return { field: "phone", message: "휴대폰 번호를 확인해 주세요." };
  if (!v.terms.service || !v.terms.privacy) return { field: "terms", message: "필수 약관에 동의해 주세요." };
  return null;
}

/** create_account 에 넘길 약관 동의 — 동의한 것만, 판 번호는 서버 값으로. */
export function consentRows(terms: SignupInput["terms"]): { key: TermKey; version: string }[] {
  const keys: TermKey[] = ["service", "privacy"];
  if (terms.news) keys.push("news");
  return keys.map((key) => ({ key, version: TERMS_VERSIONS[key] }));
}
