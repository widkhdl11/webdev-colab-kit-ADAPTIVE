import { postJson } from "@/shared/lib/http/post-json-client";

// 브라우저에서 번호 바꾸기 단계를 서버에 보낸다. 번호표는 브라우저 스크립트가 만지지 않는다 — 서버가 쿠키로 주고 쿠키에서 읽는다.

const FALLBACK = "잠시 문제가 생겼어요. 조금 뒤 다시 해 주세요.";

export type PhoneChangeField = "phone" | "verification" | "currentPassword";

export type PhoneStepOutcome<T> = ({ kind: "ok" } & T) | { kind: "login" } | { kind: "failed"; field: PhoneChangeField | null; message: string };

const FIELDS: readonly string[] = ["phone", "verification", "currentPassword"];

function failed(r: { status: number; field: string | null; message: string }): PhoneStepOutcome<never> {
  if (r.status === 401) return { kind: "login" };
  const field = r.field !== null && FIELDS.includes(r.field) ? (r.field as PhoneChangeField) : null;
  return { kind: "failed", field, message: r.message };
}

export async function requestPhoneChangeVerification(phone: string): Promise<PhoneStepOutcome<object>> {
  const r = await postJson("/api/me/phone/verify", { phone }, FALLBACK);
  return r.kind === "ok" ? { kind: "ok" } : failed(r);
}

export async function checkPhoneChangeVerification(): Promise<PhoneStepOutcome<{ verified: boolean }>> {
  const r = await postJson("/api/me/phone/verify/check", {}, FALLBACK);
  return r.kind === "ok" ? { kind: "ok", verified: r.body.status === "verified" } : failed(r);
}

export async function sendPhoneChange(phone: string, currentPassword: string): Promise<PhoneStepOutcome<object>> {
  const r = await postJson("/api/me/phone", { phone, currentPassword }, FALLBACK);
  return r.kind === "ok" ? { kind: "ok" } : failed(r);
}
