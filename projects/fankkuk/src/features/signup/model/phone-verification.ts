import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PHONE_CODE_EXPIRED_MESSAGE } from "@/entities/session/model/phone-code";
import { hashPhoneCode, makePhoneCode, type PhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { phoneSchema } from "./signup-input";

// 가입 3단계(그리고 번호 바꾸기, INV-U12)의 휴대폰 번호 확인 — 문자로 보낸 6자리 인증번호. DB 함수는 모두 앱 서버 키 전용이다.
// 요청: 번호표(ID)와 인증번호를 서버가 만든다 → 한도 확인·앞 인증번호 버리기·해시 기록을 DB 함수 한 처리에서(INV-U10·U15)
//       → 문자를 보낸다(실패하면 한 번만 다시, 그래도 실패하면 그 인증번호를 버린다). 화면에는 번호표만 쿠키로 준다.
// 확인: 입력한 6자리를 번호표와 섞어 해시하고, 만료·틀린 횟수·사용 여부 확인과 횟수 올리기는 DB 함수가 한 처리에서 한다.
//       맞으면 DB 가 확인 줄에 「확인됨」을 적는다(INV-U1). 본문의 「확인됨」·번호는 읽지 않는다.
// 인증번호 원문은 문자 본문에만 실린다 — DB·응답·오류에 넣지 않는다(INV-U15).

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export type PhoneVerificationDeps = {
  admin: { rpc: Rpc };
  /** null = 운영에서 아직 문자 대행사 연결이 없다(INV-U9). */
  verifier: PhoneVerifier | null;
  /** 인증번호 해시용 비밀 값. 창구가 있을 때만 읽는다(운영에서 창구가 없으면 비밀 값이 없어도 거부만 한다). */
  codeSecret: () => string;
};

export type StartFailReason = "closed" | "phone" | "rate_minute" | "rate_day" | "send_failed";
export type StartFail = { ok: false; status: 400 | 429 | 503; reason: StartFailReason; message: string };

export type CheckFailReason = "closed" | "shape" | "wrong" | "locked" | "expired" | "invalid";
export type CheckFail = { ok: false; status: 400 | 503; reason: CheckFailReason; message: string; remaining?: number };

const CLOSED_MESSAGE = "현재 회원가입을 이용할 수 없습니다.";
export const PHONE_SHAPE_MESSAGE = "휴대폰 번호를 확인해 주세요.";
export const SEND_FAILED_MESSAGE = "인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
const RATE_MINUTE_MESSAGE = "인증번호는 1분에 한 번 받을 수 있습니다. 잠시 후 다시 받아 주세요.";
const RATE_DAY_MESSAGE = "오늘 받을 수 있는 인증번호 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요.";
const CODE_SHAPE_MESSAGE = "인증번호 6자리를 입력해 주세요.";
const LOCKED_MESSAGE = "입력 횟수를 모두 사용했습니다. 인증번호를 다시 받아 주세요.";
const EXPIRED_MESSAGE = PHONE_CODE_EXPIRED_MESSAGE;
const INVALID_MESSAGE = "인증번호를 다시 받아 주세요.";
export const wrongCodeMessage = (remaining: number) => `인증번호가 맞지 않습니다. 남은 횟수 ${remaining}회`;

/** INV-U15: 문자 본문은 이 꼴 하나다. */
export function phoneCodeText(code: string): string {
  return `[팬꾹] 인증번호 ${code} (3분 안에 입력해 주세요)`;
}

const startSchema = z.object({ phone: phoneSchema });
const checkSchema = z.object({ verificationId: z.string().uuid(), code: z.string() });
const CODE_SHAPE = /^\d{6}$/;
const checkRowsSchema = z.array(z.object({ result: z.enum(["verified", "wrong", "locked", "expired", "invalid"]), remaining: z.number().int() }));

/** INV-U15: 발송은 한 번 실패하면 한 번만 다시 보내 본다. */
async function sendWithOneRetry(verifier: PhoneVerifier, phone: string, text: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await verifier.send(phone, text);
      return true;
    } catch {
      // 한 번 더
    }
  }
  return false;
}

/** ipHash: 요청한 접속 주소의 해시(INV-U10 — INV-U14 와 같은 방식). */
export async function startPhoneVerification(
  deps: PhoneVerificationDeps,
  body: unknown,
  ipHash: string,
): Promise<{ ok: true; verificationId: string } | StartFail> {
  if (!deps.verifier) return { ok: false, status: 503, reason: "closed", message: CLOSED_MESSAGE };
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, reason: "phone", message: PHONE_SHAPE_MESSAGE };
  const phone = parsed.data.phone;

  const verificationId = randomUUID();
  // 가짜 창구(로컬·시험 사이트)만 고정 인증번호 — 그 밖의 창구는 늘 새 난수
  const code = deps.verifier.fixedCode ?? makePhoneCode();
  const recorded = await deps.admin.rpc("request_phone_code", {
    p_id: verificationId,
    p_phone: phone,
    p_ip_hash: ipHash,
    p_code_hash: hashPhoneCode(deps.codeSecret(), verificationId, code),
  });
  if (recorded.error) {
    if (recorded.error.code === "FK428") return { ok: false, status: 429, reason: "rate_minute", message: RATE_MINUTE_MESSAGE };
    if (recorded.error.code === "FK429") return { ok: false, status: 429, reason: "rate_day", message: RATE_DAY_MESSAGE };
    if (recorded.error.code === "22023") return { ok: false, status: 400, reason: "phone", message: PHONE_SHAPE_MESSAGE };
    throw new Error(`인증번호 요청을 기록하지 못했다: ${recorded.error.code}`);
  }

  if (!(await sendWithOneRetry(deps.verifier, phone, phoneCodeText(code)))) {
    const discarded = await deps.admin.rpc("discard_phone_code", { p_id: verificationId });
    if (discarded.error) console.error(`보내지 못한 인증번호를 버리지 못했다: ${discarded.error.code ?? "코드 없음"}`);
    return { ok: false, status: 503, reason: "send_failed", message: SEND_FAILED_MESSAGE };
  }
  return { ok: true, verificationId };
}

/** 본문: { verificationId(쿠키에서 끼운 값), code }. */
export async function checkPhoneCode(deps: PhoneVerificationDeps, body: unknown): Promise<{ ok: true } | CheckFail> {
  if (!deps.verifier) return { ok: false, status: 503, reason: "closed", message: CLOSED_MESSAGE };
  const parsed = checkSchema.safeParse(body);
  if (!parsed.success) {
    const hasTicket = z.object({ verificationId: z.string().uuid() }).safeParse(body).success;
    return hasTicket
      ? { ok: false, status: 400, reason: "shape", message: CODE_SHAPE_MESSAGE }
      : { ok: false, status: 400, reason: "invalid", message: INVALID_MESSAGE };
  }
  const { verificationId, code } = parsed.data;
  if (!CODE_SHAPE.test(code)) return { ok: false, status: 400, reason: "shape", message: CODE_SHAPE_MESSAGE };

  const checked = await deps.admin.rpc("check_phone_code", {
    p_id: verificationId,
    p_code_hash: hashPhoneCode(deps.codeSecret(), verificationId, code),
  });
  if (checked.error) throw new Error(`인증번호를 확인하지 못했다: ${checked.error.code}`);
  const row = checkRowsSchema.parse(checked.data)[0];
  if (!row || row.result === "invalid") return { ok: false, status: 400, reason: "invalid", message: INVALID_MESSAGE };
  if (row.result === "verified") return { ok: true };
  if (row.result === "wrong") return { ok: false, status: 400, reason: "wrong", remaining: row.remaining, message: wrongCodeMessage(row.remaining) };
  if (row.result === "locked") return { ok: false, status: 400, reason: "locked", remaining: 0, message: LOCKED_MESSAGE };
  return { ok: false, status: 400, reason: "expired", message: EXPIRED_MESSAGE };
}
