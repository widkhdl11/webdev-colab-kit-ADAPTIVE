import type { HeardFrom } from "@/entities/metrics/model/signup-source";
import type { NameAnswer } from "../model/name-availability";
import type { SignUpField } from "../model/sign-up";
import type { CreatorProfileBody } from "../model/signup-input";

// 브라우저에서 가입 단계를 서버에 보낸다. 서버가 준 문구를 그대로 보여 준다.
// 번호표는 브라우저 스크립트가 만지지 않는다 — 서버가 쿠키로 주고 쿠키에서 읽는다(signup INV-U1, S1c).

export type SignupBody = {
  role: "fan" | "creator";
  loginId: string;
  /** 가입 닉네임(INV-U13) */
  nickname: string;
  email: string;
  password: string;
  phone: string;
  /** age14 = 「만 14세 이상입니다」(INV-U16) */
  terms: { age14: boolean; service: boolean; privacy: boolean; news: boolean };
  /** 크리에이터로 가입할 때만 — 공개 이름·채널 이름·태그(선택지 id + 직접 입력) */
  creator?: CreatorProfileBody;
  /** 「어디서 알게 되셨나요」(metrics INV-Q4) — 고르지 않으면 null */
  heardFrom: HeardFrom | null;
};

const FALLBACK = "연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";

const FIELDS: readonly SignUpField[] = [
  "verification",
  "loginId",
  "nickname",
  "email",
  "password",
  "passwordConfirm",
  "phone",
  "terms",
  "creatorName",
  "channelTitle",
  "tags",
  "fanName",
  "form",
];

async function post(url: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const messageOf = (data: Record<string, unknown> | null) => (typeof data?.message === "string" ? data.message : FALLBACK);

export type PhoneCodeRequestFail = { ok: false; reason: string; message: string };

/** 3단계 「인증번호 받기」·「다시 받기」. 인증번호는 서버가 문자로만 보낸다 — 응답에는 없다(INV-U15). */
export async function requestPhoneCode(phone: string): Promise<{ ok: true } | PhoneCodeRequestFail> {
  try {
    const { status, data } = await post("/api/signup/phone", { phone });
    if (status === 200) return { ok: true };
    return { ok: false, reason: typeof data?.reason === "string" ? data.reason : "error", message: messageOf(data) };
  } catch {
    return { ok: false, reason: "error", message: FALLBACK };
  }
}

/** 화면이 구분해 그리는 확인 실패 — wrong(남은 횟수) · locked(다섯 번 틀림) · expired(3분 지남) · 그 밖은 other */
export type PhoneCodeCheckFail = { ok: false; reason: "wrong" | "locked" | "expired" | "shape" | "other"; remaining: number | null; message: string };

const CHECK_REASONS = ["wrong", "locked", "expired", "shape"] as const;

/** 3단계 「확인」. 맞혔는지는 서버가 판정한다(INV-U1). */
export async function checkPhoneCode(code: string): Promise<{ ok: true } | PhoneCodeCheckFail> {
  try {
    const { status, data } = await post("/api/signup/phone/check", { code });
    if (status === 200 && data?.status === "verified") return { ok: true };
    const reason = CHECK_REASONS.find((r) => r === data?.reason) ?? "other";
    const remaining = typeof data?.remaining === "number" ? data.remaining : null;
    return { ok: false, reason, remaining, message: messageOf(data) };
  } catch {
    return { ok: false, reason: "other", remaining: null, message: FALLBACK };
  }
}

export async function postSignup(
  body: SignupBody,
): Promise<{ ok: true; loggedIn: boolean; mailSent: boolean } | { ok: false; field: SignUpField; message: string }> {
  try {
    const { status, data } = await post("/api/signup", body);
    if (status === 200) return { ok: true, loggedIn: data?.loggedIn === true, mailSent: data?.mailSent === true };
    const field = FIELDS.find((x) => x === data?.field) ?? "form";
    return { ok: false, field, message: messageOf(data) };
  } catch {
    return { ok: false, field: "form", message: FALLBACK };
  }
}

const ANSWERS: readonly NameAnswer[] = ["available", "taken", "invalid", "rate_limited"];

/**
 * 아이디·닉네임 미리 확인(INV-U14). 서버 답 넷 중 하나, 그 밖(네트워크·서버 오류)은 error.
 * 입력이 바뀌어 끊긴 요청(signal)은 예외를 던진다 — 부르는 쪽이 그 답을 버린다.
 */
export async function checkNameAvailability(kind: "loginId" | "nickname", value: string, signal: AbortSignal): Promise<NameAnswer> {
  const res = await fetch("/api/signup/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, value }),
    signal,
  });
  const data = (await res.json().catch(() => null)) as { result?: unknown } | null;
  return ANSWERS.find((a) => a === data?.result) ?? "error";
}
