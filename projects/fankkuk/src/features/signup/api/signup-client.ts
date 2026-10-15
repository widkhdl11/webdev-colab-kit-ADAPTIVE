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
  terms: { service: boolean; privacy: boolean; news: boolean };
  /** 크리에이터로 가입할 때만 — 공개 이름·채널 이름·태그(선택지 id + 직접 입력) */
  creator?: CreatorProfileBody;
  /** 「어디서 알게 되셨나요」(metrics INV-Q4) — 고르지 않으면 null */
  heardFrom: HeardFrom | null;
};

const FALLBACK = "잠시 문제가 생겼어요. 조금 뒤 다시 해 주세요.";

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

export async function requestPhoneVerification(phone: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { status, data } = await post("/api/signup/phone", { phone });
    return status === 200 ? { ok: true } : { ok: false, message: messageOf(data) };
  } catch {
    return { ok: false, message: FALLBACK };
  }
}

export async function checkPhoneVerification(): Promise<{ ok: true; verified: boolean } | { ok: false; message: string }> {
  try {
    const { status, data } = await post("/api/signup/phone/check", {});
    if (status === 200) return { ok: true, verified: data?.status === "verified" };
    return { ok: false, message: messageOf(data) };
  } catch {
    return { ok: false, message: FALLBACK };
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
