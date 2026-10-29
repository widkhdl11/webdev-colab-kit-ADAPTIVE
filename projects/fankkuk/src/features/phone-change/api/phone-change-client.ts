import { postJson } from "@/shared/lib/http/post-json-client";

// 브라우저에서 번호 바꾸기 단계를 서버에 보낸다. 번호표는 브라우저 스크립트가 만지지 않는다 — 서버가 쿠키로 주고 쿠키에서 읽는다.
// 인증번호(6자리)는 확인할 때 본문으로만 보낸다. 맞혔는지는 서버가 판정한다(signup INV-U1·U15).

const FALLBACK = "연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";

export type PhoneChangeField = "phone" | "code" | "verification" | "currentPassword";

export type PhoneStepOutcome = { kind: "ok" } | { kind: "login" } | { kind: "failed"; field: PhoneChangeField | null; message: string };

const FIELDS: readonly string[] = ["phone", "code", "verification", "currentPassword"];

function outcome(r: Awaited<ReturnType<typeof postJson>>): PhoneStepOutcome {
  if (r.kind === "ok") return { kind: "ok" };
  if (r.status === 401) return { kind: "login" };
  const field = r.field !== null && FIELDS.includes(r.field) ? (r.field as PhoneChangeField) : null;
  return { kind: "failed", field, message: r.message };
}

export async function requestPhoneChangeCode(phone: string): Promise<PhoneStepOutcome> {
  return outcome(await postJson("/api/me/phone/verify", { phone }, FALLBACK));
}

export async function checkPhoneChangeCode(code: string): Promise<PhoneStepOutcome> {
  return outcome(await postJson("/api/me/phone/verify/check", { code }, FALLBACK));
}

export async function sendPhoneChange(phone: string, currentPassword: string): Promise<PhoneStepOutcome> {
  return outcome(await postJson("/api/me/phone", { phone, currentPassword }, FALLBACK));
}
